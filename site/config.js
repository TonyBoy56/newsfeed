// Accounts & sync settings. Fill these in to turn on sign-in (see docs/ACCOUNTS.md).
//
// Both values are meant to be public: they identify your Supabase project,
// and anyone can see them in the page. What keeps your data private is
// row-level security (each account can only touch its own row) and
// end-to-end encryption (the row is unreadable without your password).
// Never put a "service_role" or secret key here.

export const SYNC_CONFIG = {
  url: '',     // e.g. 'https://abcdefghijklmnop.supabase.co'
  anonKey: '', // the project's publishable key (sb_publishable_…) or legacy "anon" key
};
