// CHaRM Check-In V2 -- STAGING-ONLY Supabase configuration (Step 238).
//
// This file is deliberately SEPARATE from the main app's localStorage-
// based data model. Everything in here only ever affects the small
// connection-status indicator and the optional sign-in panel -- it
// NEVER reads, writes, or clears charmCheckinDataV2 (the key the rest
// of this app uses for every check-in, payment, and material). A
// failed sign-in, an expired session, or being fully offline can
// therefore never erase or overwrite a single recorded check-in.
//
// Synchronization of check-in data to this project is NOT implemented
// yet (Step 238 is the connection foundation only). This file exists
// so a later step can add that without having to revisit auth/config.
//
// SAFETY: this project ref is STAGING. The production ref is
// hardcoded below ONLY so this file can refuse to run if it is ever
// pasted in by mistake -- never as a value to connect to.
(function () {
  'use strict';

  var STAGING_PROJECT_REF = 'jtpmwckghxcubjlghrsa';
  var FORBIDDEN_PRODUCTION_REF = 'ienajsondxjghuwrmhtl';

  // Fill in from: STAGING Supabase project -> Project Settings -> API
  // -> anon/publishable key. Never paste a service_role / sb_secret_*
  // key here -- see the guard below, which refuses to run if one is.
  var SUPABASE_URL = 'https://' + STAGING_PROJECT_REF + '.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_Rwtf6FC4UuIrF4HG8jTF1w_XicKM4aB';

  if (SUPABASE_URL.indexOf(FORBIDDEN_PRODUCTION_REF) !== -1) {
    throw new Error(
      'SAFETY STOP: supabase-config.js SUPABASE_URL references the PRODUCTION ' +
      'project (' + FORBIDDEN_PRODUCTION_REF + '). Refusing to initialize. ' +
      'This file must only ever point at STAGING (' + STAGING_PROJECT_REF + ').'
    );
  }
  if (SUPABASE_URL.indexOf(STAGING_PROJECT_REF) === -1) {
    // Not a hard stop (a future, deliberate re-pointing to a different
    // STAGING-equivalent project is conceivable), but this should never
    // be silent either.
    console.error(
      'supabase-config.js: SUPABASE_URL does not match the expected ' +
      'STAGING project ref (' + STAGING_PROJECT_REF + '). Verify this is intentional.'
    );
  }
  if (typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.indexOf('sb_secret_') === 0) {
    throw new Error(
      'SAFETY STOP: SUPABASE_ANON_KEY looks like a service_role secret key ' +
      '(sb_secret_* prefix), not an anon/publishable key. Refusing to initialize.'
    );
  }

  var client = null;
  var status = { state: 'offline', email: null, error: null };
  var listeners = [];

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](status); } catch (e) { /* one bad listener must not break the others */ }
    }
  }

  function setStatus(patch) {
    for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) status[k] = patch[k]; }
    notify();
  }

  // Lazily creates the client on first real use -- never at page load,
  // so a fully offline first launch (library didn't load from the CDN
  // yet) never throws during page initialization.
  function getClient() {
    if (client) return client;
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      setStatus({ state: 'error', error: 'The Supabase library has not loaded (offline?).' });
      return null;
    }
    if (SUPABASE_ANON_KEY === 'PASTE_YOUR_STAGING_ANON_KEY_HERE') {
      setStatus({ state: 'error', error: 'STAGING anon key has not been configured yet.' });
      return null;
    }
    client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  // Best-effort, fire-and-forget: checks whether a session already
  // exists (e.g. signed in on a previous visit while online). Never
  // throws out to the caller -- any failure (no network, expired
  // session that can't refresh, library not loaded) just settles into
  // an 'error' or 'offline' status for the indicator to show.
  function checkExistingSession() {
    setStatus({ state: 'checking', error: null });
    var c = getClient();
    if (!c) return Promise.resolve();
    return c.auth.getSession().then(function (result) {
      if (result.error) {
        setStatus({ state: 'error', email: null, error: result.error.message });
        return;
      }
      if (result.data && result.data.session) {
        setStatus({ state: 'connected', email: result.data.session.user.email, error: null });
      } else {
        setStatus({ state: 'offline', email: null, error: null });
      }
    }).catch(function () {
      setStatus({ state: 'error', email: null, error: 'Could not reach STAGING (offline?).' });
    });
  }

  function signIn(email, password) {
    setStatus({ state: 'checking', error: null });
    var c = getClient();
    if (!c) return Promise.resolve({ ok: false, error: status.error });
    return c.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
      if (result.error) {
        setStatus({ state: 'error', email: null, error: result.error.message });
        return { ok: false, error: result.error.message };
      }
      setStatus({ state: 'connected', email: result.data.user.email, error: null });
      return { ok: true };
    }).catch(function () {
      var msg = 'Network error while signing in.';
      setStatus({ state: 'error', email: null, error: msg });
      return { ok: false, error: msg };
    });
  }

  function signOut() {
    var c = getClient();
    var afterSignOut = function () { setStatus({ state: 'offline', email: null, error: null }); };
    if (!c) { afterSignOut(); return Promise.resolve(); }
    return c.auth.signOut().then(afterSignOut).catch(afterSignOut);
  }

  function onStatusChange(fn) {
    listeners.push(fn);
    fn(status);
  }

  // Generic RPC call for a signed-in session (Step 272, Phase B). Reuses
  // the same lazily-created client and the session supabase-js already
  // manages -- no separate auth path, no stored password. Resolves
  // (never rejects) with { ok, data } or { ok: false, error, transportFailure }
  // so a caller never needs its own try/catch.
  //
  // transportFailure (Step 290) distinguishes two very different
  // ok:false causes, which a caller may need to tell apart (see
  // computeSyncOutcome() in index.html):
  //   - true: the request itself never completed a round trip (a
  //     thrown fetch -- DNS failure, connection drop, timeout) or was
  //     never even attempted ("not signed in"/"not connected"). In the
  //     thrown-fetch case specifically, the server may still have
  //     received and fully processed the request before the response
  //     was lost -- this is AMBIGUOUS, never safe to treat as "did not
  //     happen." ("Not signed in"/"not connected" are reported the
  //     same way for simplicity, even though nothing was dispatched at
  //     all in those cases -- a caller that cares about that
  //     distinction already has it separately via getStatus().)
  //   - false: the request completed a round trip and the SERVER
  //     responded with an error (result.error populated by supabase-js
  //     itself, not a thrown exception here) -- the RPC function ran
  //     and errored, which for a single plpgsql function invocation
  //     with no partial commits means nothing from that call was
  //     written. Definitive, safe to treat as "did not happen."
  function callRpc(fnName, payload) {
    if (status.state !== 'connected') {
      return Promise.resolve({ ok: false, error: 'Not signed in to STAGING.', transportFailure: true });
    }
    var c = getClient();
    if (!c) return Promise.resolve({ ok: false, error: status.error || 'Not connected.', transportFailure: true });
    return c.rpc(fnName, payload).then(function (result) {
      if (result.error) {
        return { ok: false, error: result.error.message, transportFailure: false };
      }
      return { ok: true, data: result.data };
    }).catch(function () {
      return { ok: false, error: 'Network error while contacting STAGING.', transportFailure: true };
    });
  }

  window.CharmStaging = {
    checkExistingSession: checkExistingSession,
    signIn: signIn,
    signOut: signOut,
    onStatusChange: onStatusChange,
    getStatus: function () { return status; },
    callRpc: callRpc,
  };
})();
