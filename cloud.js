// Firebase (online rooms). Sirf tab load hota hai jab config.js mein asli keys hon.
import { firebaseConfig } from './config.js';

const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
let F = null, db = null, me = null;

const valid = c => c && c.apiKey && c.projectId && !/^PASTE/i.test(c.apiKey) && !/^PASTE/i.test(c.projectId);
export const ready = () => !!db && !!me;
export const uid = () => me;

export async function init() {
  if (!valid(firebaseConfig)) return false;
  try {
    const [a, f, u] = await Promise.all([
      import(B + 'firebase-app.js'), import(B + 'firebase-firestore.js'), import(B + 'firebase-auth.js')
    ]);
    const app = a.initializeApp(firebaseConfig);
    const cred = await u.signInAnonymously(u.getAuth(app));
    me = cred.user.uid; F = f; db = f.getFirestore(app);
    return true;
  } catch (e) { console.warn('Online mode off:', e); db = null; return false; }
}

const ref = code => F.doc(db, 'rooms', code);

export async function fetchRoom(code) {
  const s = await F.getDoc(ref(code));
  return s.exists() ? s.data() : null;
}

export function listen(code, cb) {
  return F.onSnapshot(ref(code), s => { if (s.exists()) cb(s.data(), s.metadata.hasPendingWrites); }, e => console.warn('Listen error:', e));
}

export function push(g) {
  const ts = Date.now();
  F.setDoc(ref(g.roomCode), {
    id: g.id, roomCode: g.roomCode, title: g.title, players: g.players, rounds: g.rounds,
    isCompleted: !!g.isCompleted, winner: g.winner || null, endedBy: g.endedBy || null,
    hostUid: g.hostUid || me, lastUpdated: ts
  }).catch(e => console.warn('Sync failed:', e));
  return ts;
}

export async function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 8; i++) {
    let c = ''; for (let j = 0; j < 6; j++) c += A[Math.floor(Math.random() * A.length)];
    if (!(await fetchRoom(c))) return c;
  }
  throw new Error('Could not generate code');
}
