// Firebase web config for online rooms between devices. Set to null to fall back to
// rooms between tabs on one device.
//
// Project: hollow-woodland-4417 (its own project, used only by Hollow). A web config
// is not a secret - it only names the project; the rules in database.rules.json
// decide who can read and write. Redeploy them with:
//   firebase deploy --only database --project hollow-woodland-4417
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyB2gejWqabFH4uxSUHlp-54PBAnGvIErGA',
  authDomain: 'hollow-woodland-4417.firebaseapp.com',
  databaseURL: 'https://hollow-woodland-4417-default-rtdb.firebaseio.com',
  projectId: 'hollow-woodland-4417',
  appId: '1:96309241975:web:4a09c5f46bc1f50a75fe72',
};
