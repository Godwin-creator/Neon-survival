import admin from 'firebase-admin';
admin.initializeApp({ projectId: 'neon-survival-15e00' });
async function test() {
  try {
    const db = admin.firestore();
    await db.collection('scores').limit(1).get();
    console.log('Admin Firestore works!');
  } catch (e) {
    console.error('Admin Firestore failed:', e.message);
  }
}
test();
