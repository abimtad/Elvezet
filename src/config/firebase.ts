import admin from "firebase-admin";

let initialized = false;

export const initializeFirebaseAdmin = ({
  projectId,
  clientEmail,
  privateKey,
}: {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}): void => {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    initialized = true;
  }
};

export const getFirebaseAdmin = (): typeof admin => {
  if (!initialized) {
    throw new Error("Firebase Admin SDK is not initialized");
  }
  return admin;
};
