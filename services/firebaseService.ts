import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
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
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Firestore (with databaseId specified)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
}

// 1. Save or Update Project in Cloud
export async function saveProjectToCloud(projectId: string, title: string, pages: any[], canvases: any): Promise<void> {
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
      updatedAt: serverTimestamp()
    };

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
        canvases: data.canvases || {}
      });
    });

    return projects;
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
