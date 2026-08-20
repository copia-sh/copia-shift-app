import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "./config";

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOut() {
  return firebaseSignOut(auth);
}

export function subscribeToAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
