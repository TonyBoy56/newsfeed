// Account screens: sign in, create account, two-factor, recovery key,
// password changes, and the Account panel on the You page.
// All the security work happens in sync.js and crypto.js. This file is UI.

export function mountAccount({ sync, h, put, $, toast, openDialog, closeDialog, onChange }) {
  let st = sync.state;
  sync.subscribe((next) => {
    const promptRecovery = next.recovery && !st.recovery;
    st = next;
    onChange?.(st);
    if (promptRecovery && next.status !== 'mfa') showReset();
    if (next.status === 'mfa' && !$('#dialog').open) showMfa();
  });

  // ---------- small pieces ----------

  const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
  const input = (id, type, attrs = {}) => h('input', { id, type, autocomplete: 'off', spellcheck: 'false', ...attrs });
  const errorBox = () => h('div', { class: 'form-error', role: 'alert' });
  const showError = (box, msg) => { box.textContent = msg || ''; box.hidden = !msg; };
  const busy = (btn, on, label) => {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  };
  const ago = (t) => {
    if (!t) return 'never';
    const s = (Date.now() - t) / 1000;
    return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  };

  /** Password box with a live strength meter and a breach check. */
  function passwordWithMeter(id, emailInput) {
    const pw = input(id, 'password', { autocomplete: 'new-password', minlength: '12' });
    const bar = h('div', { class: 'meter', 'aria-hidden': 'true' }, ...Array.from({ length: 4 }, () => h('span', {})));
    const tips = h('div', { class: 'hint' });
    const state = { ok: false, pwned: null };
    const update = () => {
      const r = sync.passwordStrength(pw.value, emailInput?.value || '');
      state.ok = r.ok;
      [...bar.children].forEach((seg, i) => seg.classList.toggle('on', pw.value && i < Math.max(1, r.score)));
      bar.dataset.score = String(r.score);
      tips.textContent = pw.value ? (r.ok ? (state.pwned ? '' : 'Strong password.') : r.tips[0] || 'Make it longer or less predictable.') : 'At least 12 characters. A memorable sentence is ideal.';
      if (state.pwned) tips.textContent = `This password has appeared in ${state.pwned.toLocaleString()} data breaches. Please choose another.`;
    };
    pw.addEventListener('input', () => { state.pwned = null; update(); });
    pw.addEventListener('change', async () => {
      if (!pw.value) return;
      const n = await sync.pwnedCount(pw.value);
      state.pwned = n || null;
      update();
    });
    update();
    return { el: h('div', {}, pw, bar, tips), input: pw, state };
  }

  // ---------- sign in / create account ----------

  function showSignIn(mode = 'signin') {
    if (!st.available) { showSetupHelp(); return; }
    const email = input('acct-email', 'email', { autocomplete: 'username', inputmode: 'email', placeholder: 'you@example.com' });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, mode === 'signin' ? 'Sign in' : 'Create account');

    if (mode === 'signin') {
      const pw = input('acct-pw', 'password', { autocomplete: 'current-password' });
      const onSubmit = async (e) => {
        e.preventDefault();
        showError(err);
        busy(submit, true, 'Unlocking…');
        try {
          handleResult(await sync.signIn(email.value, pw.value));
        } catch (ex) {
          showError(err, ex.message);
        } finally { busy(submit, false); }
      };
      openDialog('Sign in',
        h('form', { class: 'form', onsubmit: onSubmit },
          h('p', {}, 'Sign in to sync your interests, notes, saves and settings across your devices. Everything is encrypted on this device before it leaves.'),
          field(email.id, 'Email', email),
          field(pw.id, 'Password', pw),
          err,
          h('div', { class: 'actions spread' },
            h('div', { class: 'link-row' },
              h('button', { type: 'button', class: 'link-btn', onclick: () => showSignIn('signup') }, 'Create an account'),
              h('button', { type: 'button', class: 'link-btn', onclick: () => showForgot(email.value) }, 'Forgot password?')),
            submit)));
      queueMicrotask(() => email.focus());
      return;
    }

    const pw = passwordWithMeter('acct-pw-new', email);
    const confirm = input('acct-pw-confirm', 'password', { autocomplete: 'new-password' });
    const onSubmit = async (e) => {
      e.preventDefault();
      showError(err);
      if (!pw.state.ok) { showError(err, 'Choose a stronger password first.'); pw.input.focus(); return; }
      if (pw.state.pwned) { showError(err, 'That password is in known data breaches. Choose another.'); return; }
      if (pw.input.value !== confirm.value) { showError(err, 'The passwords don\'t match.'); confirm.focus(); return; }
      busy(submit, true, 'Creating…');
      try {
        handleResult(await sync.signUp(email.value, pw.input.value));
      } catch (ex) {
        showError(err, sync.friendly(ex));
      } finally { busy(submit, false); }
    };
    openDialog('Create your account',
      h('form', { class: 'form', onsubmit: onSubmit },
        h('div', { class: 'note-box' },
          h('strong', {}, 'Your password is also your encryption key. '),
          'It never leaves this device in readable form, and nobody (including the sync service) can read your data without it. You\'ll also get a recovery key in case you forget it.'),
        field(email.id, 'Email', email),
        field(pw.input.id, 'Password', pw.el),
        field(confirm.id, 'Confirm password', confirm),
        err,
        h('div', { class: 'actions spread' },
          h('button', { type: 'button', class: 'link-btn', onclick: () => showSignIn('signin') }, 'I already have an account'),
          submit)));
    queueMicrotask(() => email.focus());
  }

  function handleResult(res) {
    switch (res?.state) {
      case 'mfa': return showMfa();
      case 'recovery': return showRecoveryKey(res.recoveryKey, true);
      case 'needs-recovery': case 'reset': return showReset(true);
      case 'locked': return showUnlock();
      case 'confirm-email':
        return openDialog('Check your email',
          h('p', {}, 'We sent you a confirmation link. Open it on this device, then sign in here. The link expires after a while, so do it soon.'),
          h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => showSignIn('signin') }, 'Go to sign in')));
      default:
        closeDialog();
        toast('Signed in. Your data is synced and encrypted.');
    }
  }

  // ---------- two-factor ----------

  function codeInput(id) {
    return input(id, 'text', { inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9 ]{6,7}', maxlength: '7', placeholder: '123 456', class: 'code-input' });
  }

  function showMfa() {
    const code = codeInput('mfa-code');
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Verify');
    const onSubmit = async (e) => {
      e.preventDefault();
      showError(err);
      busy(submit, true, 'Checking…');
      try { handleResult(await sync.verifyMfa(code.value)); } catch (ex) { showError(err, ex.message); code.select(); } finally { busy(submit, false); }
    };
    openDialog('Two-factor check',
      h('form', { class: 'form', onsubmit: onSubmit },
        h('p', {}, 'Enter the 6-digit code from your authenticator app.'),
        field(code.id, 'Code', code),
        err,
        h('div', { class: 'actions' }, submit)));
    queueMicrotask(() => code.focus());
  }

  async function showEnableMfa() {
    let enrollment;
    try { enrollment = await sync.enrollMfa(); } catch (ex) { toast(sync.friendly(ex)); return; }
    const code = codeInput('mfa-new-code');
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Turn on');
    let done = false;
    const onSubmit = async (e) => {
      e.preventDefault();
      showError(err);
      busy(submit, true, 'Checking…');
      try {
        await sync.confirmMfa(enrollment.id, code.value);
        done = true;
        closeDialog();
        toast('Two-factor is on. You\'ll need a code when you sign in on a new device.');
      } catch (ex) { showError(err, ex.message); } finally { busy(submit, false); }
    };
    const qr = h('img', { class: 'qr', alt: 'QR code for your authenticator app', width: '180', height: '180' });
    if (/^data:image\/svg\+xml/.test(enrollment.qr)) qr.src = enrollment.qr;
    openDialog('Turn on two-factor',
      h('form', { class: 'form', onsubmit: onSubmit },
        h('ol', { class: 'steps' },
          h('li', {}, 'Open an authenticator app: 1Password, Google Authenticator, Microsoft Authenticator, Authy, or similar.'),
          h('li', {}, 'Scan this QR code, or enter the key by hand.'),
          h('li', {}, 'Type the 6-digit code it shows.')),
        h('div', { class: 'qr-wrap' }, qr, h('div', {},
          h('div', { class: 'hint' }, 'Setup key'),
          h('code', { class: 'secret' }, (enrollment.secret || '').replace(/(.{4})/g, '$1 ').trim()))),
        field(code.id, 'Code from the app', code),
        err,
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn', onclick: () => closeDialog() }, 'Cancel'),
          submit)));
    $('#dialog').addEventListener('close', () => { if (!done) sync.cancelMfa(enrollment.id); }, { once: true });
    queueMicrotask(() => code.focus());
  }

  // ---------- recovery key ----------

  function showRecoveryKey(key, isNew) {
    const box = h('input', { type: 'checkbox', id: 'rk-ok' });
    const cont = h('button', { type: 'button', class: 'btn primary', disabled: true }, 'Continue');
    box.addEventListener('change', () => { cont.disabled = !box.checked; });
    const download = () => {
      const blob = new Blob([`Signal recovery key\nAccount: ${st.email}\nCreated: ${new Date().toLocaleString()}\n\n${key}\n\nKeep this somewhere safe and private. It can unlock your synced data if you forget your password.\n`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'signal-recovery-key.txt' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    cont.addEventListener('click', () => {
      if (isNew && !st.mfa) return offerMfa();
      closeDialog();
      toast('All set. Your data is synced and encrypted.');
    });
    openDialog('Save your recovery key',
      h('p', {}, 'If you ever forget your password, this key is the only way to unlock your synced data. Nobody can reset it for you. Not even the sync service can.'),
      h('div', { class: 'recovery-key', 'aria-label': 'Recovery key' }, key),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(key); toast('Copied'); } catch { toast('Copy failed: select it and copy by hand'); } } }, 'Copy'),
        h('button', { type: 'button', class: 'btn', onclick: download }, 'Download .txt')),
      h('p', { class: 'hint' }, 'Good places: your password manager, or printed and kept with important papers. Not in your email or notes apps.'),
      h('label', { class: 'check-row', for: 'rk-ok' }, box, 'I saved my recovery key somewhere safe'),
      h('div', { class: 'actions' }, cont));
  }

  function offerMfa() {
    openDialog('Add two-factor?',
      h('p', {}, 'Two-factor authentication means a stolen password isn\'t enough to get into your account: sign-ins on a new device also need a code from your phone. It takes about a minute to set up.'),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => { closeDialog(); toast('You can turn on two-factor any time from the You page.'); } }, 'Not now'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => showEnableMfa() }, 'Set it up')));
  }

  // ---------- unlock / forgot / reset ----------

  function showUnlock() {
    if (st.recovery) { showReset(); return; }
    const pw = input('unlock-pw', 'password', { autocomplete: 'current-password' });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Unlock');
    openDialog('Unlock your synced data',
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); showError(err); busy(submit, true, 'Unlocking…');
        try { await sync.unlock(pw.value); closeDialog(); toast('Unlocked and synced'); } catch (ex) { showError(err, ex.message); } finally { busy(submit, false); }
      } },
        h('p', {}, `You're signed in as ${st.email || 'your account'}, but this device doesn't have your encryption key yet. Enter your password to unlock it.`),
        field(pw.id, 'Password', pw),
        err,
        h('div', { class: 'actions spread' },
          h('button', { type: 'button', class: 'link-btn', onclick: () => showReset(true) }, 'Use my recovery key instead'),
          submit)));
    queueMicrotask(() => pw.focus());
  }

  function showForgot(prefill = '') {
    const email = input('forgot-email', 'email', { autocomplete: 'username', value: prefill });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Send reset link');
    openDialog('Forgot your password?',
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); showError(err); busy(submit, true, 'Sending…');
        try {
          await sync.requestReset(email.value);
          put($('#dialog-body'), h('p', {}, 'If that email has an account, a reset link is on its way. Open it on this device. You\'ll set a new password and use your recovery key to unlock your synced data.'));
        } catch (ex) { showError(err, sync.friendly(ex)); } finally { busy(submit, false); }
      } },
        h('p', {}, 'Because your data is end-to-end encrypted, resetting your password needs your recovery key to keep your synced data. Without it, you can still get back into your account and start fresh from this device\'s data.'),
        field(email.id, 'Email', email),
        err,
        h('div', { class: 'actions' }, submit)));
  }

  function showReset() {
    const pw = passwordWithMeter('reset-pw', null);
    const confirm = input('reset-confirm', 'password', { autocomplete: 'new-password' });
    const rk = input('reset-rk', 'text', { placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', class: 'mono' });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Set new password');
    openDialog('Set a new password',
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); showError(err);
        if (!pw.state.ok) { showError(err, 'Choose a stronger password first.'); return; }
        if (pw.input.value !== confirm.value) { showError(err, 'The passwords don\'t match.'); return; }
        if (!rk.value.trim() && !$('#reset-fresh').checked) { showError(err, 'Enter your recovery key, or tick "Start fresh" below.'); return; }
        busy(submit, true, 'Updating…');
        try { handleResult(await sync.completeReset(pw.input.value, rk.value.trim() || null)); } catch (ex) { showError(err, ex.message); } finally { busy(submit, false); }
      } },
        field(pw.input.id, 'New password', pw.el),
        field(confirm.id, 'Confirm new password', confirm),
        field(rk.id, 'Recovery key', rk, 'Unlocks your existing synced data with the new password.'),
        h('label', { class: 'check-row', for: 'reset-fresh' }, h('input', { type: 'checkbox', id: 'reset-fresh' }),
          'I don\'t have my recovery key. Start fresh from this device\'s data (the old synced copy is deleted).'),
        err,
        h('div', { class: 'actions' }, submit)));
  }

  // ---------- signed-in actions ----------

  function showChangePassword() {
    const cur = input('cp-cur', 'password', { autocomplete: 'current-password' });
    const pw = passwordWithMeter('cp-new', null);
    const confirm = input('cp-confirm', 'password', { autocomplete: 'new-password' });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, 'Change password');
    openDialog('Change password',
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); showError(err);
        if (!pw.state.ok || pw.state.pwned) { showError(err, 'Choose a stronger new password.'); return; }
        if (pw.input.value !== confirm.value) { showError(err, 'The new passwords don\'t match.'); return; }
        busy(submit, true, 'Re-encrypting…');
        try { await sync.changePassword(cur.value, pw.input.value); closeDialog(); toast('Password changed. Your recovery key still works.'); } catch (ex) { showError(err, sync.friendly(ex)); } finally { busy(submit, false); }
      } },
        field(cur.id, 'Current password', cur),
        field(pw.input.id, 'New password', pw.el),
        field(confirm.id, 'Confirm new password', confirm),
        err,
        h('div', { class: 'actions' }, submit)));
  }

  function confirmPassword(title, text, action, label) {
    const pw = input('cf-pw', 'password', { autocomplete: 'current-password' });
    const err = errorBox(); showError(err);
    const submit = h('button', { type: 'submit', class: 'btn primary' }, label);
    openDialog(title,
      h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault(); showError(err); busy(submit, true, 'Working…');
        try { await action(pw.value); } catch (ex) { showError(err, sync.friendly(ex)); } finally { busy(submit, false); }
      } }, h('p', {}, text), field(pw.id, 'Password', pw), err, h('div', { class: 'actions' }, submit)));
    queueMicrotask(() => pw.focus());
  }

  function confirmDanger(title, text, label, action) {
    openDialog(title, h('p', {}, text), h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => closeDialog() }, 'Cancel'),
      h('button', { type: 'button', class: 'btn danger', onclick: async () => { await action(); closeDialog(); } }, label)));
  }

  function showSetupHelp() {
    openDialog('Accounts aren\'t set up yet',
      h('p', {}, 'Signing in needs a free Supabase project to store your encrypted data. Setup takes about 10 minutes: follow docs/ACCOUNTS.md in your repository, then paste two values into site/config.js.'),
      h('p', {}, 'Until then, everything still works on this device, and you can move your data between devices with Export and Import backup.'));
  }

  // ---------- the Account panel (on the You page) ----------

  const STATUS_TEXT = {
    unconfigured: 'Not set up yet', 'signed-out': 'Not signed in', 'signing-in': 'Signing in…', mfa: 'Waiting for your two-factor code',
    locked: 'Signed in, locked on this device', syncing: 'Syncing…', synced: 'Synced', error: 'Sync problem', offline: 'Offline: will sync when you\'re back',
  };

  function renderPanel() {
    const signedIn = ['synced', 'syncing', 'error', 'offline', 'locked'].includes(st.status);
    const status = h('div', { class: `sync-status s-${st.status}` }, h('span', { class: 'dot-ind' }),
      STATUS_TEXT[st.status] || st.status,
      st.status === 'synced' ? h('span', { class: 'hint' }, ` · ${ago(st.lastSync)}`) : null);
    return h('section', { class: 'profile-panel account-panel' },
      h('h2', {}, 'Account & sync'),
      status,
      st.error ? h('p', { class: 'form-error' }, st.error) : null,
      !signedIn ? h('div', {},
        h('p', { class: 'hint' }, 'Sign in to carry your interests, notes, saves, appearance and vibes to any device. Your data is end-to-end encrypted: it\'s locked with your password before it leaves this device.'),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => (st.status === 'mfa' ? showMfa() : showSignIn('signin')) }, st.status === 'mfa' ? 'Enter code' : 'Sign in'),
          st.available ? h('button', { type: 'button', class: 'btn', onclick: () => showSignIn('signup') }, 'Create account') : null))
        : h('div', {},
          h('ul', { class: 'row-list' },
            h('li', {}, h('span', {}, 'Email'), h('span', {}, st.email || '')),
            h('li', {}, h('span', {}, 'Encryption'), h('span', { class: 'status-ok' }, 'End-to-end (AES-256)')),
            h('li', {}, h('span', {}, 'Two-factor'), st.mfa
              ? h('span', {}, h('span', { class: 'status-ok' }, 'On '), h('button', { type: 'button', class: 'link-btn', onclick: () => confirmDanger('Turn off two-factor?', 'Your account will only be protected by your password.', 'Turn off', async () => { await sync.disableMfa(); toast('Two-factor is off'); }) }, 'Turn off'))
              : h('button', { type: 'button', class: 'btn primary small', onclick: showEnableMfa }, 'Turn on'))),
          h('div', { class: 'btn-row' },
            st.status === 'locked' ? h('button', { type: 'button', class: 'btn primary', onclick: showUnlock }, 'Unlock') : h('button', { type: 'button', class: 'btn', onclick: () => sync.pull() }, 'Sync now'),
            h('button', { type: 'button', class: 'btn', onclick: showChangePassword }, 'Change password'),
            h('button', { type: 'button', class: 'btn', onclick: () => confirmPassword('New recovery key', 'This replaces your old recovery key, which will stop working.', async (p) => showRecoveryKey(await sync.newRecoveryKey(p), false), 'Create new key') }, 'New recovery key')),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', onclick: async () => { await sync.signOut(); toast('Signed out. Your data stays on this device.'); } }, 'Sign out'),
            h('button', { type: 'button', class: 'btn', onclick: () => confirmDanger('Sign out everywhere?', 'Every device signed in to this account will be signed out.', 'Sign out everywhere', async () => { await sync.signOut({ everywhere: true }); toast('Signed out on all devices'); }) }, 'Sign out everywhere'),
            h('button', { type: 'button', class: 'btn danger', onclick: () => confirmDanger('Delete your synced data?', 'This deletes the encrypted copy stored online. The data on this device stays. Your account still exists, and you can sync again later.', 'Delete synced data', async () => { await sync.deleteSyncedData(); toast('Synced data deleted'); }) }, 'Delete synced data'))));
  }

  /** The little status button at the bottom of the sidebar. */
  function chip() {
    const signedIn = ['synced', 'syncing', 'error', 'offline', 'locked'].includes(st.status);
    return h('button', {
      type: 'button', class: `link-btn sync-chip s-${st.status}`,
      title: STATUS_TEXT[st.status] || '',
      onclick: () => (signedIn ? document.dispatchEvent(new CustomEvent('signal-open-profile')) : st.status === 'mfa' ? showMfa() : showSignIn('signin')),
    }, h('span', { class: 'dot-ind' }), signedIn ? (st.status === 'synced' ? 'Synced' : STATUS_TEXT[st.status]) : 'Sign in');
  }

  return { renderPanel, chip, showSignIn };
}
