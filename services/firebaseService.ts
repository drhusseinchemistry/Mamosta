import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  collection, 
  getDoc, 
  getDocs, 
  getDocFromServer,
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp 
} from 'firebase/firestore';
import appletConfig from '../firebase-applet-config.json';

// Resolve configuration: Support custom VITE_ environment variables (useful for Netlify, GitHub Pages, etc.)
const metaEnv = (import.meta as any).env || {};
const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || appletConfig.apiKey,
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain,
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket,
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId,
  appId: metaEnv.VITE_FIREBASE_APP_ID || appletConfig.appId,
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || appletConfig.measurementId,
  firestoreDatabaseId: metaEnv.VITE_FIREBASE_DATABASE_ID || (appletConfig as any).firestoreDatabaseId || undefined,
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore (with databaseId specified)
// Standard Firestore uses '(default)' database which should not be passed to getFirestore
const dbId = firebaseConfig.firestoreDatabaseId;
export const db = (dbId && dbId !== "(default)" && dbId !== "") 
  ? getFirestore(app, dbId) 
  : getFirestore(app);

// Validate Connection on Boot as mandated by guidelines
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase connection test completed.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration: Client is offline.");
    } else {
      console.warn("Connection test completed with expected offline or initial state:", error);
    }
  }
}

// Ensure connection is tested
testConnection();

// Mandatory Firestore Error Handling Format
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error Details:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auth Actions
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Google sign-in failed:", error);
    throw error;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  } catch (error) {
    console.error("Email login failed:", error);
    throw error;
  }
}

export async function registerWithEmail(email: string, pass: string, displayName: string) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(res.user, { displayName });
    return res.user;
  } catch (error) {
    console.error("Email registration failed:", error);
    throw error;
  }
}

export async function loginAsGuest(displayName: string = "مێوان / Guest") {
  try {
    const res = await signInAnonymously(auth);
    await updateProfile(res.user, { displayName });
    return res.user;
  } catch (error) {
    console.error("Anonymous login failed:", error);
    throw error;
  }
}

export async function logOut() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign-out failed:", error);
    throw error;
  }
}

// Firestore Database Operations for PDF Projects
export interface CloudProject {
  id: string;
  title: string;
  userId: string;
  createdAt: any;
  updatedAt: any;
  pages: any[];
  canvases: Record<string, any>;
  isPublished?: boolean;
  requestPublish?: boolean;
  authorName?: string;
  authorEmail?: string;
}

// 1. Save or Update Project in Cloud
export async function saveProjectToCloud(
  projectId: string, 
  title: string, 
  pages: any[], 
  canvases: any, 
  isPublished?: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("تکایە سەرەتا بچۆ ژوورەوە بۆ پاشەکەوتکردن ل سەر سحابێ");
  }

  const projectPath = `projects/${projectId}`;
  try {
    const projectRef = doc(db, 'projects', projectId);
    const existingDoc = await getDoc(projectRef);

    const isNew = !existingDoc.exists();
    
    // Structure strictly to comply with rule schema validation (mandatory properties)
    const payload: any = {
      id: projectId,
      title: title,
      userId: user.uid,
      pages: pages.map(p => ({
        pageNumber: p.pageNumber,
        viewport: { width: p.viewport.width, height: p.viewport.height },
        image: p.image || '' // string url / representation
      })),
      canvases: canvases,
      updatedAt: serverTimestamp(),
      authorName: user.displayName || 'کۆدکار',
      authorEmail: user.email || 'guest@kpdf.local'
    };

    if (isPublished !== undefined) {
      payload.isPublished = isPublished;
    }

    if (isNew) {
      payload.createdAt = serverTimestamp();
      await setDoc(projectRef, payload);
    } else {
      // Ensure immutability for createdAt and userId during updates
      payload.createdAt = existingDoc.data()?.createdAt;
      await setDoc(projectRef, payload, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, isNewDocument(projectId) ? OperationType.CREATE : OperationType.UPDATE, projectPath);
  }
}

// Helper to determine if we are creating vs updating (failsafe)
let projectChecks: Record<string, boolean> = {};
function isNewDocument(id: string): boolean {
  if (projectChecks[id] === undefined) {
    return true;
  }
  return projectChecks[id];
}

// 2. Load User Projects from Cloud
export async function getCloudProjects(): Promise<CloudProject[]> {
  const user = auth.currentUser;
  if (!user) return [];

  const collectionPath = 'projects';
  try {
    const projectsQuery = query(
      collection(db, 'projects'),
      where('userId', '==', user.uid)
    );

    const snapshot = await getDocs(projectsQuery);
    const projects: CloudProject[] = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      projects.push({
        id: docSnap.id,
        title: data.title,
        userId: data.userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        pages: data.pages || [],
        canvases: data.canvases || {},
        isPublished: data.isPublished || false,
        requestPublish: data.requestPublish || false,
        authorName: data.authorName || 'بەکارهێنەرێک',
        authorEmail: data.authorEmail || ''
      });
    });

    return projects;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

// 2b. Load Published Templates from Cloud
export async function getCloudTemplates(): Promise<CloudProject[]> {
  const collectionPath = 'projects';
  try {
    const templatesQuery = query(
      collection(db, 'projects'),
      where('isPublished', '==', true)
    );

    const snapshot = await getDocs(templatesQuery);
    const templates: CloudProject[] = [];
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      templates.push({
        id: docSnap.id,
        title: data.title,
        userId: data.userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        pages: data.pages || [],
        canvases: data.canvases || {},
        isPublished: true,
        requestPublish: data.requestPublish || false,
        authorName: data.authorName || 'بەکارهێنەرێک',
        authorEmail: data.authorEmail || ''
      });
    });

    return templates;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

// 3. Delete Project from Cloud
export async function deleteProjectFromCloud(projectId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("تکایە سەرەتا بچۆ ژوورەوە بۆ سڕینەوە");
  }

  const projectPath = `projects/${projectId}`;
  try {
    const projectRef = doc(db, 'projects', projectId);
    await deleteDoc(projectRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, projectPath);
  }
}

// 4. Request Public Publish
export async function requestProjectPublish(projectId: string, authorName: string, authorEmail: string): Promise<void> {
  try {
    const projectRef = doc(db, 'projects', projectId);
    await setDoc(projectRef, {
      requestPublish: true,
      authorName: authorName,
      authorEmail: authorEmail,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
}

// 5. Approve Project Publish (Admin only)
export async function approveProjectPublish(projectId: string, isApproved: boolean): Promise<void> {
  try {
    const projectRef = doc(db, 'projects', projectId);
    await setDoc(projectRef, {
      isPublished: isApproved,
      requestPublish: false,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
}

// 6. Get Pending Projects for Admin Approval
export async function getPendingProjects(): Promise<CloudProject[]> {
  try {
    const pendingQuery = query(
      collection(db, 'projects'),
      where('requestPublish', '==', true)
    );
    const snapshot = await getDocs(pendingQuery);
    const projects: CloudProject[] = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      projects.push({
        id: docSnap.id,
        title: data.title,
        userId: data.userId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        pages: data.pages || [],
        canvases: data.canvases || {},
        isPublished: data.isPublished || false,
        requestPublish: true,
        authorName: data.authorName || 'بەکارهێنەرێک',
        authorEmail: data.authorEmail || ''
      });
    });
    return projects;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'projects');
  }
}
