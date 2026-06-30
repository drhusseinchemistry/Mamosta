import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import PageEditor, { createTableGroup } from './components/PageEditor';
import { createMathSymbolGroup } from './utils/mathSymbols';
import { createGraphFabricGroup } from './utils/graphDrawer';
import { TextFormatter } from './components/TextFormatter';
import { EditorState, PageData, ToolType } from './types';
import { initializePDFJS, loadPDFDocument, renderPDFPageToDataURL } from './services/pdfService';
import { transcribeAudio, performOCR, validateApiKey, lastValidationError, generateMathFromImage, checkServerConfig, troubleshootPage, troubleshootKpdfPage } from './services/geminiService';
import { Icons } from './components/Icon';
import { 
  auth, 
  signInWithGoogle, 
  loginWithEmail, 
  registerWithEmail, 
  loginAsGuest, 
  logOut, 
  saveProjectToCloud, 
  getCloudProjects, 
  getCloudTemplates, 
  deleteProjectFromCloud, 
  requestProjectPublish, 
  approveProjectPublish, 
  getPendingProjects, 
  CloudProject,
  getGoogleAccessToken,
  setGoogleAccessToken
} from './services/firebaseService';
import { onAuthStateChanged, User } from 'firebase/auth';
import { 
  listDriveFiles, 
  downloadDriveFile, 
  uploadDriveFile, 
  DriveFile 
} from './services/googleDriveService';

interface CharStyle {
  fill?: string;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  [key: string]: any;
}

interface FabricStyles {
  [lineIndex: number]: {
    [charIndex: number]: CharStyle;
  };
}

const parseHtmlStyles = (input: string): { plainText: string; styles: FabricStyles } => {
  let preprocessed = input || "";
  // Preprocess Markdown bold/italic to HTML tags so the rest of the parsing works seamlessly
  preprocessed = preprocessed.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  preprocessed = preprocessed.replace(/__(.*?)__/g, '<b>$1</b>');
  preprocessed = preprocessed.replace(/\*(.*?)\*/g, '<i>$1</i>');
  preprocessed = preprocessed.replace(/_(.*?)_/g, '<i>$1</i>');

  let plainText = "";
  const styles: FabricStyles = {};
  
  let currentLine = 0;
  let currentChar = 0;
  
  const stateStack: CharStyle[] = [];
  
  const tagRegex = /(?:<span[^>]*style=["'][^"']*color:\s*(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)[^"']*["'][^>]*>|<font[^>]*color=["']([^"']+)["'][^>]*>|\[color=([^\]]+)\]|<\/span>|<\/font>|\[\/color\]|<b>|\[b\]|<\/b>|\[\/b\]|<i>|\[i\]|<\/i>|\[\/i\]|<u>|\[u\]|<\/u>|\[\/u\]|<[^>]+>|\[[^\]]+\])/gi;
  
  let lastIdx = 0;
  let match;
  
  while ((match = tagRegex.exec(preprocessed)) !== null) {
    const matchIdx = match.index;
    const matchStr = match[0];
    
    // Add text preceding the tag to our plain text
    const prevText = preprocessed.substring(lastIdx, matchIdx);
    for (let i = 0; i < prevText.length; i++) {
      const char = prevText[i];
      plainText += char;
      
      if (char === '\n') {
        currentLine++;
        currentChar = 0;
      } else {
        const mergedStyle: CharStyle = {};
        stateStack.forEach(s => {
          Object.assign(mergedStyle, s);
        });
        
        if (Object.keys(mergedStyle).length > 0) {
          if (!styles[currentLine]) {
            styles[currentLine] = {};
          }
          styles[currentLine][currentChar] = mergedStyle;
        }
        currentChar++;
      }
    }
    
    const lowerMatch = matchStr.toLowerCase();
    
    if (match[1]) {
      stateStack.push({ fill: match[1] });
    } else if (match[2]) {
      stateStack.push({ fill: match[2] });
    } else if (match[3]) {
      stateStack.push({ fill: match[3] });
    } else if (lowerMatch === '<b>' || lowerMatch === '[b]') {
      stateStack.push({ fontWeight: 'bold' });
    } else if (lowerMatch === '<i>' || lowerMatch === '[i]') {
      stateStack.push({ fontStyle: 'italic' });
    } else if (lowerMatch === '<u>' || lowerMatch === '[u]') {
      stateStack.push({ underline: true });
    } else if (
      lowerMatch === '</span>' || 
      lowerMatch === '</font>' || 
      lowerMatch === '[/color]' ||
      lowerMatch === '</b>' || 
      lowerMatch === '[/b]' || 
      lowerMatch === '</i>' || 
      lowerMatch === '[/i]' || 
      lowerMatch === '</u>' || 
      lowerMatch === '[/u]'
    ) {
      let targetProp: keyof CharStyle | null = null;
      if (lowerMatch === '</span>' || lowerMatch === '</font>' || lowerMatch === '[/color]') {
        targetProp = 'fill';
      } else if (lowerMatch === '</b>' || lowerMatch === '[/b]') {
        targetProp = 'fontWeight';
      } else if (lowerMatch === '</i>' || lowerMatch === '[/i]') {
        targetProp = 'fontStyle';
      } else if (lowerMatch === '</u>' || lowerMatch === '[/u]') {
        targetProp = 'underline';
      }
      
      if (targetProp) {
        for (let i = stateStack.length - 1; i >= 0; i--) {
          if (stateStack[i][targetProp] !== undefined) {
            stateStack.splice(i, 1);
            break;
          }
        }
      }
    }
    
    lastIdx = tagRegex.lastIndex;
  }
  
  const remainingText = preprocessed.substring(lastIdx);
  for (let i = 0; i < remainingText.length; i++) {
    const char = remainingText[i];
    plainText += char;
    
    if (char === '\n') {
      currentLine++;
      currentChar = 0;
    } else {
      const mergedStyle: CharStyle = {};
      stateStack.forEach(s => {
        Object.assign(mergedStyle, s);
      });
      
      if (Object.keys(mergedStyle).length > 0) {
        if (!styles[currentLine]) {
          styles[currentLine] = {};
        }
        styles[currentLine][currentChar] = mergedStyle;
      }
      currentChar++;
    }
  }
  
  return { plainText, styles };
};

const ThemeStyleInjector: React.FC<{ theme: string }> = ({ theme }) => {
  let primary = '#3b82f6'; // default tailwind blue
  let hover = '#1d4ed8';
  let ringColor = 'rgba(59, 130, 246, 0.4)';

  if (theme === 'indigo') {
    primary = '#6366f1';
    hover = '#4f46e5';
    ringColor = 'rgba(99, 102, 241, 0.4)';
  } else if (theme === 'emerald') {
    primary = '#10b981';
    hover = '#059669';
    ringColor = 'rgba(16, 185, 129, 0.4)';
  } else if (theme === 'purple') {
    primary = '#8b5cf6';
    hover = '#7c3aed';
    ringColor = 'rgba(139, 92, 246, 0.4)';
  } else if (theme === 'gold') {
    primary = '#f59e0b';
    hover = '#d97706';
    ringColor = 'rgba(245, 158, 11, 0.4)';
  } else if (theme === 'slate') {
    primary = '#71717a';
    hover = '#52525b';
    ringColor = 'rgba(113, 113, 122, 0.4)';
  }

  const css = `
    .bg-primary { background-color: ${primary} !important; }
    .hover\\:bg-primary:hover { background-color: ${hover} !important; }
    .text-primary { color: ${primary} !important; }
    .border-primary { border-color: ${primary} !important; }
    .focus\\:border-primary:focus { border-color: ${primary} !important; }
    .accent-primary { accent-color: ${primary} !important; }
    .ring-primary { --tw-ring-color: ${primary} !important; ring-color: ${primary} !important; }
    
    /* Active toolbar selections style */
    .bg-primary.text-white {
      background-color: ${primary} !important;
      box-shadow: 0 0 15px ${ringColor} !important;
    }
  `;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
};

const App: React.FC = () => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePage, setActivePage] = useState<number>(1);
  const [activeTextSelection, setActiveTextSelection] = useState<{ canvas: any; object: any } | null>(null);
  const [showFormatterSidebar, setShowFormatterSidebar] = useState<boolean>(false);

  useEffect(() => {
    if (!activeTextSelection) {
      setShowFormatterSidebar(false);
    }
  }, [activeTextSelection]);

  const [editorState, setEditorState] = useState<EditorState>({
    activeTool: 'pen',
    strokeColor: '#000000',
    strokeWidth: 4,
    scale: 1,
    isProcessing: false,
    statusMessage: null
  });

  // AI & Settings State
  const [apiKey, setApiKey] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<'idle' | 'validating' | 'connected' | 'error'>('idle');
  const [apiErrorMessage, setApiErrorMessage] = useState<string>('');
  const [showApiModal, setShowApiModal] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [voiceLanguage, setVoiceLanguage] = useState<string>('ku_badini');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Customizable Settings
  const [iconSize, setIconSize] = useState<number>(18);
  const [appTheme, setAppTheme] = useState<string>('indigo'); // indigo, emerald, purple, gold, slate
  const [listMarkerStyle, setListMarkerStyle] = useState<string>('•'); // •, ●, ■, ★, ✔, -
  const [settingsTab, setSettingsTab] = useState<'design' | 'ai' | 'cloud'>('design');

  // Firebase State
  const [user, setUser] = useState<User | null>(null);
  const [cloudProjects, setCloudProjects] = useState<CloudProject[]>([]);
  const [cloudTemplates, setCloudTemplates] = useState<CloudProject[]>([]);
  const [saveTitle, setSaveTitle] = useState<string>('');

  // Projects Modal and Custom Authentication State
  const [showProjectsModal, setShowProjectsModal] = useState<boolean>(false);
  const [showTopRightMenu, setShowTopRightMenu] = useState<boolean>(false);
  const [projectsTab, setProjectsTab] = useState<'my' | 'public' | 'pending'>('my');
  const [pendingProjects, setPendingProjects] = useState<CloudProject[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isCloudLoading, setIsCloudLoading] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authDisplayName, setAuthDisplayName] = useState<string>('');
  const [authIsSignUp, setAuthIsSignUp] = useState<boolean>(false);

  // Google Drive State Variables
  const [showDriveModal, setShowDriveModal] = useState<boolean>(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isDriveLoading, setIsDriveLoading] = useState<boolean>(false);
  const [driveSearch, setDriveSearch] = useState<string>('');
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [saveDriveFilename, setSaveDriveFilename] = useState<string>('');
  const [saveDriveType, setSaveDriveType] = useState<'pdf' | 'kpdf'>('pdf');

  // Auto-Save Refs
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializingRef = useRef<boolean>(true);

  // Hidden inputs refs
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // Store fabric canvas instances
  const canvasesRef = useRef<{[key: number]: any}>({});
  const pdfDocRef = useRef<any>(null);
  const pendingCanvasesRef = useRef<Record<number, any> | null>(null);

  // Undo/Redo Canvas History State
  const canvasHistoryRef = useRef<{[pageNumber: number]: {
    undoStack: string[];
    redoStack: string[];
    isApplying: boolean;
  }}>({});

  const [forceUpdate, setForceUpdate] = useState<number>(0);

  const getPageHistory = (pageNumber: number) => {
    if (!canvasHistoryRef.current[pageNumber]) {
      canvasHistoryRef.current[pageNumber] = {
        undoStack: [],
        redoStack: [],
        isApplying: false
      };
    }
    return canvasHistoryRef.current[pageNumber];
  };

  const saveCanvasState = (pageNumber: number) => {
    const canvas = canvasesRef.current[pageNumber];
    if (!canvas) return;
    const history = getPageHistory(pageNumber);
    if (history.isApplying) return;

    try {
      const stateJson = JSON.stringify(canvas.toJSON());
      const lastState = history.undoStack[history.undoStack.length - 1];
      if (stateJson !== lastState) {
        history.undoStack.push(stateJson);
        history.redoStack = []; // Clear redo stack on new action
        if (history.undoStack.length > 50) {
          history.undoStack.shift();
        }
        setForceUpdate(prev => prev + 1);
        handleAutoSave();
      }
    } catch (e) {
      console.error("Error saving canvas state:", e);
    }
  };

  const handleUndo = () => {
    const canvas = canvasesRef.current[activePage];
    if (!canvas) return;
    const history = getPageHistory(activePage);
    if (history.undoStack.length <= 1) return;

    const currentState = history.undoStack.pop();
    if (currentState) {
      history.redoStack.push(currentState);
    }

    const previousState = history.undoStack[history.undoStack.length - 1];
    if (previousState) {
      history.isApplying = true;
      canvas.loadFromJSON(JSON.parse(previousState), () => {
        const page = pages.find(p => p.pageNumber === activePage);
        if (page && page.image) {
          window.fabric.Image.fromURL(page.image, (img: any) => {
            canvas.setBackgroundImage(img, () => {
              canvas.renderAll();
              history.isApplying = false;
              setForceUpdate(prev => prev + 1);
            }, {
              scaleX: canvas.width! / img.width!,
              scaleY: canvas.height! / img.height!
            });
          });
        } else {
          canvas.renderAll();
          history.isApplying = false;
          setForceUpdate(prev => prev + 1);
        }
      });
    }
  };

  const handleRedo = () => {
    const canvas = canvasesRef.current[activePage];
    if (!canvas) return;
    const history = getPageHistory(activePage);
    if (history.redoStack.length === 0) return;

    const nextState = history.redoStack.pop();
    if (nextState) {
      history.undoStack.push(nextState);
      history.isApplying = true;
      canvas.loadFromJSON(JSON.parse(nextState), () => {
        const page = pages.find(p => p.pageNumber === activePage);
        if (page && page.image) {
          window.fabric.Image.fromURL(page.image, (img: any) => {
            canvas.setBackgroundImage(img, () => {
              canvas.renderAll();
              history.isApplying = false;
              setForceUpdate(prev => prev + 1);
            }, {
              scaleX: canvas.width! / img.width!,
              scaleY: canvas.height! / img.height!
            });
          });
        } else {
          canvas.renderAll();
          history.isApplying = false;
          setForceUpdate(prev => prev + 1);
        }
      });
    }
  };

  // --- Auto-Save Functions ---
  const handleAutoSave = () => {
    if (isInitializingRef.current) return;
    try {
      const serializedCanvases = Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
        const canvas = canvasesRef.current[Number(pageNum)];
        if (canvas) {
          acc[Number(pageNum)] = canvas.toJSON();
        }
        return acc;
      }, {} as Record<number, any>);

      const draftState = {
        pages,
        canvases: serializedCanvases,
        activePage,
        appTheme,
        iconSize,
        listMarkerStyle,
        timestamp: Date.now()
      };
      localStorage.setItem('kurdish_pdf_active_draft', JSON.stringify(draftState));
    } catch (e) {
      console.error("Local auto-save error:", e);
    }

    // Cloud auto-save if logged in (debounced)
    if (auth.currentUser) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
          const serializedCanvases = Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
            const canvas = canvasesRef.current[Number(pageNum)];
            if (canvas) {
              acc[Number(pageNum)] = canvas.toJSON();
            }
            return acc;
          }, {} as Record<number, any>);

          const safePages = pages.map(p => ({
            pageNumber: p.pageNumber,
            viewport: { width: p.viewport.width, height: p.viewport.height },
            image: p.image || ''
          }));

          await saveProjectToCloud(`draft-${user.uid}`, `ڕەشنووسی خۆکار (Auto Draft)`, safePages, serializedCanvases, false);
          console.log("Cloud auto-saved draft successfully.");
        } catch (e) {
          console.error("Cloud auto-save error:", e);
        }
      }, 1500);
    }
  };

  // Load draft from cloud or local storage
  const loadDraft = async (currentUser: User | null) => {
    isInitializingRef.current = true;
    try {
      if (currentUser) {
        // Load cloud draft if exists
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('./services/firebaseService');
          const draftRef = doc(db, 'projects', `draft-${currentUser.uid}`);
          const draftSnap = await getDoc(draftRef);
          if (draftSnap.exists()) {
            const draftData = draftSnap.data();
            if (draftData && draftData.pages && draftData.canvases) {
              pendingCanvasesRef.current = draftData.canvases;
              setPages(draftData.pages);
              setActivePage(1);
              isInitializingRef.current = false;
              return;
            }
          }
        } catch (cloudErr) {
          console.error("Failed to fetch cloud draft, falling back:", cloudErr);
        }
      }

      // Local storage fallback
      const localDraftStr = localStorage.getItem('kurdish_pdf_active_draft');
      if (localDraftStr) {
        const localDraft = JSON.parse(localDraftStr);
        if (localDraft && localDraft.pages && localDraft.canvases) {
          pendingCanvasesRef.current = localDraft.canvases;
          setPages(localDraft.pages);
          if (localDraft.appTheme) setAppTheme(localDraft.appTheme);
          if (localDraft.iconSize) setIconSize(Number(localDraft.iconSize));
          if (localDraft.listMarkerStyle) setListMarkerStyle(localDraft.listMarkerStyle);
          if (localDraft.activePage) setActivePage(localDraft.activePage);
        }
      }
    } catch (e) {
      console.error("Error loading draft:", e);
    } finally {
      isInitializingRef.current = false;
    }
  };

  // Trigger auto-save when pages, activePage, etc change
  useEffect(() => {
    if (!isInitializingRef.current && pages.length > 0) {
      handleAutoSave();
    }
  }, [pages, activePage, appTheme, iconSize, listMarkerStyle]);

  const loadAllCloudData = async (currentUser?: User | null) => {
    const activeUser = currentUser !== undefined ? currentUser : user;
    if (!activeUser) {
      setCloudProjects([]);
      setCloudTemplates([]);
      setPendingProjects([]);
      return;
    }

    setIsCloudLoading(true);
    setCloudError(null);
    try {
      // 1. Fetch own cloud projects
      const projs = await getCloudProjects();
      setCloudProjects(projs || []);

      // 2. Fetch approved public templates
      const temps = await getCloudTemplates();
      setCloudTemplates(temps || []);

      // 3. If admin, fetch pending requests
      if (activeUser.email === 'hussein.zebary.chemistry96@gmail.com') {
        const pending = await getPendingProjects();
        setPendingProjects(pending || []);
      } else {
        setPendingProjects([]);
      }
    } catch (err: any) {
      console.error("Failed to load cloud data:", err);
      setCloudError(err.message || "خەتا د بارکرنا داتایێن سحابێ دا ڕوویدا");
    } finally {
      setIsCloudLoading(false);
    }
  };

  // Initialize Firebase Auth & Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Load cloud projects and templates via unified loader
        await loadAllCloudData(currentUser);
        
        // Load settings from firestore
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('./services/firebaseService');
          const settingsSnap = await getDoc(doc(db, 'users', currentUser.uid));
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            if (data.theme) setAppTheme(data.theme);
            if (data.iconSize) setIconSize(Number(data.iconSize));
            if (data.listMarker) setListMarkerStyle(data.listMarker);
          }
        } catch (err) {
          console.error("Failed to load user settings:", err);
        }
      } else {
        setCloudProjects([]);
        setCloudTemplates([]);
        setPendingProjects([]);
        setGoogleAccessToken(null);
      }

      // Load draft (local or cloud)
      loadDraft(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Initialize external libraries
  useEffect(() => {
    const loadLibs = async () => {
       initializePDFJS();
    };
    loadLibs();
    
    // Load API Key from local storage or environment variables (e.g. for GitHub Pages/Cloud deployments)
    const savedKey = localStorage.getItem('gemini_api_key') || (import.meta as any).env.VITE_GEMINI_API_KEY || '';
    if (savedKey) {
      setApiKey(savedKey);
      setApiStatus('connected'); // Assume connected if key exists locally
    }

    // Load custom settings
    const savedIconSize = localStorage.getItem('app_icon_size');
    if (savedIconSize) setIconSize(Number(savedIconSize));

    const savedTheme = localStorage.getItem('app_theme');
    if (savedTheme) setAppTheme(savedTheme);

    const savedListMarker = localStorage.getItem('app_list_marker');
    if (savedListMarker) setListMarkerStyle(savedListMarker);
  }, []);

  // Save Settings handler
  const saveCustomSettings = async (newSize: number, newTheme: string, newMarker: string) => {
    setIconSize(newSize);
    setAppTheme(newTheme);
    setListMarkerStyle(newMarker);
    localStorage.setItem('app_icon_size', String(newSize));
    localStorage.setItem('app_theme', newTheme);
    localStorage.setItem('app_list_marker', newMarker);

    // Sync with Firestore if logged in
    if (auth.currentUser) {
      try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./services/firebaseService');
        await setDoc(doc(db, 'users', auth.currentUser.uid), {
          userId: auth.currentUser.uid,
          theme: newTheme,
          iconSize: newSize,
          listMarker: newMarker,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.error("Failed to sync settings with Firestore:", err);
      }
    }
  };

  // --- API Key Management ---
  const saveApiKey = async () => {
    const cleanKey = apiKey.trim().replace(/^["']|["']$/g, "");
    if (!cleanKey) {
       setApiStatus('error');
       setApiErrorMessage('تکایە سەرەتا کۆدی کلیلەکە بنووسە.');
       return;
    }
    
    setApiStatus('validating');
    setApiErrorMessage('');
    const isValid = await validateApiKey(cleanKey);
    
    if (isValid) {
        localStorage.setItem('gemini_api_key', cleanKey);
        setApiKey(cleanKey);
        setApiStatus('connected');
        setApiErrorMessage('');
        // Auto close after 1.5 second of success
        setTimeout(() => setShowApiModal(false), 1500);
    } else {
        setApiStatus('error');
        setApiErrorMessage(lastValidationError || 'کۆدی کلیلەکە هەڵەیە یان پەیوەست نابێت.');
    }
  };

  // --- Audio Recording (STT) ---
  const handleToggleRecording = async () => {
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان");
      setShowApiModal(true);
      return;
    }

    if (isRecording) {
      // Stop Recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
           // Create Blob
           const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
           // Stop tracks
           stream.getTracks().forEach(track => track.stop());

           // Process with AI
           setEditorState(prev => ({...prev, isProcessing: true, statusMessage: '...گۆڕینی دەنگ بۆ نووسین'}));
           try {
             const text = await transcribeAudio(apiKey, audioBlob, voiceLanguage);
             if (text) {
               addTextToCanvas(text);
             }
           } catch (error: any) {
             alert("کێشەیەک ڕوویدا:\n" + error.message);
           } finally {
             setEditorState(prev => ({...prev, isProcessing: false, statusMessage: null}));
           }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("ناتوانین دەستکاری مایک بکەین. تکایە ڕێگە بدە بە بەکارهێنانی مایک.");
      }
    }
  };

  // --- OCR Logic (File Based) ---
  const handleRunOCRClick = async () => {
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان");
      setShowApiModal(true);
      return;
    }
    // Open File Dialog immediately
    ocrInputRef.current?.click();
  };

  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setEditorState(prev => ({...prev, isProcessing: true, statusMessage: '...OCR (وێنە/PDF) شیکردنەوەی'}));
      
      try {
        let imageDataUrl = '';

        if (file.type === 'application/pdf') {
             // Handle PDF: Render first page to image
             const pdfDoc = await loadPDFDocument(file);
             const { dataUrl } = await renderPDFPageToDataURL(pdfDoc, 1, 1.5); // 1.5 scale for better OCR
             imageDataUrl = dataUrl;
        } else {
             // Handle Image
             imageDataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (evt) => resolve(evt.target?.result as string);
                reader.readAsDataURL(file);
             });
        }

        const text = await performOCR(apiKey, imageDataUrl);
        if (text) {
             addTextToCanvas(text);
        } else {
             alert("هیچ نووسینێک نەدۆزرایەوە");
        }

      } catch (error: any) {
          console.error(error);
          alert("OCR Failed: " + error.message);
      } finally {
          setEditorState(prev => ({...prev, isProcessing: false, statusMessage: null}));
          e.target.value = ''; // Reset input
      }
  };

  // --- AI Math Parser ---
  const handleAIParseMath = async (file: File, instruction: string) => {
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان (Settings)");
      setShowApiModal(true);
      return;
    }

    const activeCanvas = canvasesRef.current[activePage];
    if (!activeCanvas || !window.fabric) return;

    setEditorState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      statusMessage: 'چاوەڕێبە... شیکردنەوەی بیرکاری دهێتە ئەنجامدان...' 
    }));

    try {
      let imageDataUrl = '';
      if (file.type === 'application/pdf') {
        const pdfDoc = await loadPDFDocument(file);
        const { dataUrl } = await renderPDFPageToDataURL(pdfDoc, 1, 1.5);
        imageDataUrl = dataUrl;
      } else {
        imageDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target?.result as string);
          reader.readAsDataURL(file);
        });
      }

      const jsonString = await generateMathFromImage(apiKey, imageDataUrl, instruction);
      
      let cleanJsonString = jsonString.trim();
      if (cleanJsonString.startsWith('```')) {
        cleanJsonString = cleanJsonString.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }
      
      const data = JSON.parse(cleanJsonString);
      if (!data || !Array.isArray(data.elements)) {
        throw new Error("داتای وەرگیراو نە گونجاوە.");
      }

      const elements = data.elements;
      const center = activeCanvas.getVpCenter();
      let currentTop = center.y - 120; // Start higher to fit multiple lines beautifully
      const textColor = editorState.strokeColor || '#1f2937';
      
      const addedObjects: any[] = [];

      // Helper to check if text contains Arabic/Kurdish characters for dynamic RTL
      const isRtlText = (text: string): boolean => {
        const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        return rtlRegex.test(text);
      };

      // Split elements into lines based on 'newline' elements
      const hasCoordinates = elements.some((elem: any) => elem.x !== undefined && elem.y !== undefined);

      if (hasCoordinates) {
        // Coordinate-based absolute/relative layout for diagrams/flowcharts
        for (const elem of elements) {
          if (elem.type === 'newline') continue;

          const fSize = elem.fontSize || 14;
          const elementColor = elem.color || textColor;
          const angle = elem.angle !== undefined ? elem.angle : 0;
          
          // Coordinate positions relative to canvas center
          const left = center.x + (elem.x || 0);
          const top = center.y + (elem.y || 0);

          if (elem.type === 'text') {
            if (!elem.text) continue;
            const isRtl = isRtlText(elem.text);
            const { plainText, styles: parsedStyles } = parseHtmlStyles(elem.text);
            const textWidth = elem.width || Math.max(100, Math.min(350, (plainText.length * fSize * 0.75) + 16));
            const textObj = new window.fabric.Textbox(plainText, {
              left: left,
              top: top,
              width: textWidth,
              fontSize: fSize,
              fill: elementColor,
              fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
              selectable: true,
              originX: 'center',
              originY: 'center',
              textAlign: isRtl ? 'right' : 'left',
              angle: angle,
              splitByGrapheme: true,
              minWidth: 10,
              styles: parsedStyles
            });
            textObj.rawHtmlText = elem.text;
            activeCanvas.add(textObj);
            addedObjects.push(textObj);
          } else if (elem.type === 'line') {
            const w = elem.width || 120;
            const lineObj = new window.fabric.Line([-w/2, 0, w/2, 0], {
              stroke: elementColor,
              strokeWidth: elem.strokeWidth || 2,
              selectable: true,
              originX: 'center',
              originY: 'center',
              left: left,
              top: top,
              angle: angle
            });
            activeCanvas.add(lineObj);
            addedObjects.push(lineObj);
          } else if (elem.type === 'arrow') {
            const w = elem.width || 80;
            const arrowShaft = new window.fabric.Line([-w/2, 0, w/2 - 6, 0], {
              stroke: elementColor,
              strokeWidth: elem.strokeWidth || 3,
              originX: 'center',
              originY: 'center'
            });
            const arrowHead = new window.fabric.Triangle({
              left: w/2 - 3,
              top: 0,
              width: 12,
              height: 12,
              fill: elementColor,
              angle: 90,
              originX: 'center',
              originY: 'center'
            });
            const arrowGroup = new window.fabric.Group([arrowShaft, arrowHead], {
              left: left,
              top: top,
              angle: angle,
              selectable: true,
              hasControls: true
            });
            activeCanvas.add(arrowGroup);
            addedObjects.push(arrowGroup);
          } else if (elem.type === 'square') {
            const size = elem.width || elem.height || 40;
            const squareObj = new window.fabric.Rect({
              left: left,
              top: top,
              width: size,
              height: size,
              fill: 'transparent',
              stroke: elementColor,
              strokeWidth: elem.strokeWidth || 2,
              strokeUniform: true,
              selectable: true,
              originX: 'center',
              originY: 'center',
              angle: angle
            });
            activeCanvas.add(squareObj);
            addedObjects.push(squareObj);
          } else if (elem.type === 'rectangle') {
            const rw = elem.width || 60;
            const rh = elem.height || 40;
            const rectObj = new window.fabric.Rect({
              left: left,
              top: top,
              width: rw,
              height: rh,
              fill: 'transparent',
              stroke: elementColor,
              strokeWidth: elem.strokeWidth || 2,
              strokeUniform: true,
              selectable: true,
              originX: 'center',
              originY: 'center',
              angle: angle
            });
            activeCanvas.add(rectObj);
            addedObjects.push(rectObj);
          } else if (elem.type === 'image_icon') {
            const emoji = elem.text || '🫀';
            const iconObj = new window.fabric.IText(emoji, {
              left: left,
              top: top,
              fontSize: elem.fontSize || 38,
              selectable: true,
              originX: 'center',
              originY: 'center',
              angle: angle
            });
            activeCanvas.add(iconObj);
            addedObjects.push(iconObj);
          } else {
            const mathGroup = createMathSymbolGroup(
              elem.type, 
              left, 
              top, 
              textColor, 
              {
                numerator: elem.numerator,
                denominator: elem.denominator,
                topText: elem.topText,
                bottomText: elem.bottomText,
              }
            );

            if (mathGroup) {
              mathGroup.set({
                originX: 'center',
                originY: 'center',
                left: left,
                top: top,
                angle: angle
              });
              activeCanvas.add(mathGroup);
              addedObjects.push(mathGroup);
            }
          }
        }
      } else {
        const linesOfElements: any[][] = [[]];
        for (const elem of elements) {
          if (elem.type === 'newline') {
            linesOfElements.push([]);
          } else {
            linesOfElements[linesOfElements.length - 1].push(elem);
          }
        }

        // Process line by line
        for (const line of linesOfElements) {
          if (line.length === 0) {
            currentTop += 65;
            continue;
          }

          // Determine if this line contains any RTL (Kurdish/Arabic) text
          const lineIsRtl = line.some((elem: any) => elem.type === 'text' && elem.text && isRtlText(elem.text));

          // Calculate total line width to center it beautifully
          let totalLineWidth = 0;
          const elemWidths = line.map((elem: any) => {
            const fSize = elem.fontSize || 14;
            if (elem.type === 'text') {
              if (!elem.text) return 0;
              return (elem.text.length * fSize * 0.55) + 12;
            } else if (elem.type === 'line') {
              return (elem.width || 120) + 12;
            } else if (elem.type === 'arrow') {
              return (elem.width || 80) + 12;
            } else if (elem.type === 'square') {
              const size = elem.width || elem.height || 40;
              return size + 12;
            } else if (elem.type === 'rectangle') {
              const rw = elem.width || 60;
              return rw + 12;
            } else if (elem.type === 'image_icon') {
              return (elem.fontSize || 38) + 12;
            } else {
              // Math symbol groups
              let estWidth = 50;
              if (elem.type === 'fraction') {
                const numLen = elem.numerator ? elem.numerator.length : 1;
                const denLen = elem.denominator ? elem.denominator.length : 1;
                const maxLen = Math.max(numLen, denLen);
                estWidth = (maxLen * 12) + 24;
              } else if (elem.type === 'sigma_sum' || elem.type === 'product' || elem.type === 'definite_integral') {
                estWidth = 55;
              } else if (elem.type === 'limit') {
                estWidth = 65;
              }
              return estWidth + 10;
            }
          });

          totalLineWidth = elemWidths.reduce((sum, w) => sum + w, 0);

          // Center position on X-axis
          let currentLeft = 0;
          if (lineIsRtl) {
            // If RTL, we start on the right and move leftward
            currentLeft = center.x + (totalLineWidth / 2);
          } else {
            // If LTR, we start on the left and move rightward
            currentLeft = center.x - (totalLineWidth / 2);
          }

          // Add each element in the line
          for (let i = 0; i < line.length; i++) {
            const elem = line[i];
            const elemWidth = elemWidths[i];
            if (elemWidth === 0) continue;

            const fSize = elem.fontSize || 14; // Default font size 14 as requested
            const elementColor = elem.color || textColor;

            if (elem.type === 'text') {
              if (!elem.text) continue;
              const { plainText, styles: parsedStyles } = parseHtmlStyles(elem.text);
              const textObj = new window.fabric.Textbox(plainText, {
                left: currentLeft,
                top: currentTop,
                width: elem.width || elemWidth || 250,
                fontSize: fSize,
                fill: elementColor,
                fontFamily: 'Noto Sans Arabic, Inter, sans-serif',
                selectable: true,
                originX: lineIsRtl ? 'right' : 'left',
                originY: 'center',
                textAlign: lineIsRtl ? 'right' : 'left',
                splitByGrapheme: true,
                minWidth: 10,
                styles: parsedStyles
              });
              textObj.rawHtmlText = elem.text;
              activeCanvas.add(textObj);
              addedObjects.push(textObj);
            } else if (elem.type === 'line') {
              const w = elem.width || 120;
              const lineObj = new window.fabric.Line(
                lineIsRtl 
                  ? [currentLeft, currentTop, currentLeft - w, currentTop]
                  : [currentLeft, currentTop, currentLeft + w, currentTop], 
                {
                  stroke: elementColor,
                  strokeWidth: elem.strokeWidth || 2,
                  selectable: true,
                  originX: lineIsRtl ? 'right' : 'left',
                  originY: 'center'
                }
              );
              activeCanvas.add(lineObj);
              addedObjects.push(lineObj);
            } else if (elem.type === 'arrow') {
              const w = elem.width || 80;
              let arrowGroup;
              if (lineIsRtl) {
                const arrowShaft = new window.fabric.Line([currentLeft, currentTop, currentLeft - w + 10, currentTop], {
                  stroke: elementColor,
                  strokeWidth: elem.strokeWidth || 3,
                  selectable: true,
                  originX: 'right',
                  originY: 'center'
                });
                const arrowHead = new window.fabric.Triangle({
                  left: currentLeft - w,
                  top: currentTop,
                  width: 12,
                  height: 12,
                  fill: elementColor,
                  angle: 270,
                  originX: 'center',
                  originY: 'center',
                  selectable: true
                });
                arrowGroup = new window.fabric.Group([arrowShaft, arrowHead], {
                  selectable: true,
                  hasControls: true
                });
              } else {
                const arrowShaft = new window.fabric.Line([currentLeft, currentTop, currentLeft + w - 10, currentTop], {
                  stroke: elementColor,
                  strokeWidth: elem.strokeWidth || 3,
                  selectable: true,
                  originX: 'left',
                  originY: 'center'
                });
                const arrowHead = new window.fabric.Triangle({
                  left: currentLeft + w,
                  top: currentTop,
                  width: 12,
                  height: 12,
                  fill: elementColor,
                  angle: 90,
                  originX: 'center',
                  originY: 'center',
                  selectable: true
                });
                arrowGroup = new window.fabric.Group([arrowShaft, arrowHead], {
                  selectable: true,
                  hasControls: true
                });
              }
              activeCanvas.add(arrowGroup);
              addedObjects.push(arrowGroup);
            } else if (elem.type === 'square') {
              const size = elem.width || elem.height || 40;
              const squareObj = new window.fabric.Rect({
                left: lineIsRtl ? currentLeft - size : currentLeft,
                top: currentTop - size/2,
                width: size,
                height: size,
                fill: 'transparent',
                stroke: elementColor,
                strokeWidth: elem.strokeWidth || 2,
                strokeUniform: true,
                selectable: true
              });
              activeCanvas.add(squareObj);
              addedObjects.push(squareObj);
            } else if (elem.type === 'rectangle') {
              const rw = elem.width || 60;
              const rh = elem.height || 40;
              const rectObj = new window.fabric.Rect({
                left: lineIsRtl ? currentLeft - rw : currentLeft,
                top: currentTop - rh/2,
                width: rw,
                height: rh,
                fill: 'transparent',
                stroke: elementColor,
                strokeWidth: elem.strokeWidth || 2,
                strokeUniform: true,
                selectable: true
              });
              activeCanvas.add(rectObj);
              addedObjects.push(rectObj);
            } else if (elem.type === 'image_icon') {
              const emoji = elem.text || '🫀';
              const iconObj = new window.fabric.IText(emoji, {
                left: currentLeft,
                top: currentTop,
                fontSize: elem.fontSize || 38,
                selectable: true,
                originX: lineIsRtl ? 'right' : 'left',
                originY: 'center',
              });
              activeCanvas.add(iconObj);
              addedObjects.push(iconObj);
            } else {
              // Math symbol groups
              const mathGroup = createMathSymbolGroup(
                elem.type, 
                currentLeft, 
                currentTop, 
                textColor, 
                {
                  numerator: elem.numerator,
                  denominator: elem.denominator,
                  topText: elem.topText,
                  bottomText: elem.bottomText,
                }
              );

              if (mathGroup) {
                mathGroup.set({
                  originX: lineIsRtl ? 'right' : 'left',
                  originY: 'center',
                  left: currentLeft,
                  top: currentTop,
                });
                
                activeCanvas.add(mathGroup);
                addedObjects.push(mathGroup);
              }
            }

            // Advance left position for next element
            if (lineIsRtl) {
              currentLeft -= elemWidth;
            } else {
              currentLeft += elemWidth;
            }
          }

          // Move top down for next line
          currentTop += 65;
        }
      }

      // Select all added elements together as an ActiveSelection so they are temporarily grouped for moving, but individually editable
      if (addedObjects.length > 0) {
        const sel = new window.fabric.ActiveSelection(addedObjects, {
          canvas: activeCanvas,
        });
        activeCanvas.setActiveObject(sel);
      }

      activeCanvas.renderAll();
      saveCanvasState(activePage);
      
      setEditorState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        statusMessage: 'پرسیارا بیرکاری ب دروستی هاتە جێبەجێکرن!' 
      }));
    } catch (error: any) {
      console.error("AI Math parsing failed:", error);
      alert("کێشەیەک ڕوویدا: " + (error.message || error));
      setEditorState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        statusMessage: null 
      }));
    }
  };

  const getElementsFromCanvas = (canvas: any) => {
    if (!canvas) return [];
    const center = canvas.getVpCenter();
    const objects = canvas.getObjects();
    const elements = [];

    for (const obj of objects) {
      if (obj.id === 'temp-guide' || obj.isType('activeSelection')) continue;

      const rx = Math.round(obj.left - center.x);
      const ry = Math.round(obj.top - center.y);
      const angle = obj.angle || 0;
      const color = obj.fill || obj.stroke || '#1f2937';
      const strokeWidth = obj.strokeWidth || 2;
      const fSize = obj.fontSize || 14;

      if (obj.isFractionGroup || obj.fractionId) {
        const children = obj.getObjects ? obj.getObjects() : [];
        const numTextObj = children.find((c: any) => c.fractionRole === 'numerator');
        const denTextObj = children.find((c: any) => c.fractionRole === 'denominator');
        elements.push({
          type: 'fraction',
          numerator: numTextObj ? numTextObj.text : 'a',
          denominator: denTextObj ? denTextObj.text : 'b',
          x: rx,
          y: ry,
          color: obj.fractionColor || color,
          angle: angle
        });
      } else if (obj.mathRole === 'main' || obj.type === 'group') {
        const children = obj.getObjects ? obj.getObjects() : [];
        const mainObj = children.find((c: any) => c.mathRole === 'main');
        const topObj = children.find((c: any) => c.mathRole === 'top');
        const bottomObj = children.find((c: any) => c.mathRole === 'bottom');
        
        let mathType = 'text';
        if (mainObj) {
          if (mainObj.text === '∑') mathType = 'sigma_sum';
          else if (mainObj.text === '∏') mathType = 'product';
          else if (mainObj.text === '∫') mathType = 'definite_integral';
          else if (mainObj.text === 'lim') mathType = 'limit';
        } else {
          const hasLine = children.some((c: any) => c.type === 'line');
          const hasTriangle = children.some((c: any) => c.type === 'triangle');
          if (hasLine && hasTriangle) {
            elements.push({
              type: 'arrow',
              x: rx,
              y: ry,
              width: obj.width || 80,
              color: color,
              angle: angle
            });
            continue;
          }
        }

        if (mathType !== 'text') {
          elements.push({
            type: mathType,
            topText: topObj ? topObj.text : '',
            bottomText: bottomObj ? bottomObj.text : '',
            x: rx,
            y: ry,
            color: color,
            angle: angle
          });
        } else {
          const textParts = children.filter((c: any) => c.text !== undefined).map((c: any) => c.text).join(' ');
          if (textParts.trim()) {
            elements.push({
              type: 'text',
              text: textParts,
              x: rx,
              y: ry,
              fontSize: fSize,
              color: color,
              angle: angle
            });
          }
        }
      } else if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
        const text = obj.text || '';
        const emojiRegex = /[\uD800-\uDBFF][\uDC00-\uDFFF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2600-\u27BF]/;
        if (text.length <= 4 && emojiRegex.test(text)) {
          elements.push({
            type: 'image_icon',
            text: text,
            x: rx,
            y: ry,
            fontSize: fSize,
            angle: angle
          });
        } else {
          elements.push({
            type: 'text',
            text: text,
            x: rx,
            y: ry,
            fontSize: fSize,
            color: color,
            angle: angle
          });
        }
      } else if (obj.type === 'line') {
        elements.push({
          type: 'line',
          x: rx,
          y: ry,
          width: obj.width || 120,
          strokeWidth: strokeWidth,
          color: obj.stroke || color,
          angle: angle
        });
      } else if (obj.type === 'rect') {
        if (obj.width === obj.height) {
          elements.push({
            type: 'square',
            x: rx,
            y: ry,
            width: obj.width,
            strokeWidth: strokeWidth,
            color: obj.stroke || color,
            angle: angle
          });
        } else {
          elements.push({
            type: 'rectangle',
            x: rx,
            y: ry,
            width: obj.width,
            height: obj.height,
            strokeWidth: strokeWidth,
            color: obj.stroke || color,
            angle: angle
          });
        }
      }
    }

    return elements;
  };

  const handleTroubleshootPage = async (instruction: string) => {
    const hasServerKey = await checkServerConfig();
    if (!apiKey && !hasServerKey) {
      alert("تکایە سەرەتا API Key زیاد بکە لە ڕێکخستنەکان (Settings)");
      setShowApiModal(true);
      return;
    }

    const activeCanvas = canvasesRef.current[activePage];
    if (!activeCanvas || !window.fabric) return;

    setEditorState(prev => ({ 
      ...prev, 
      isProcessing: true, 
      statusMessage: 'چاوەڕێبە... چارەسەرکرنا ئاریشێن لاپەرەی دهێتە ئەنجامدان...' 
    }));

    try {
      // Discard active objects to avoid saving selection box
      const activeObj = activeCanvas.getActiveObject();
      if (activeObj) {
        activeCanvas.discardActiveObject();
      }

      // 1. Capture the current active page and canvas as a .kpdf format JSON
      const activePageData = pages.find(p => p.pageNumber === activePage);
      
      // Let's create a lightweight pages list without the heavy page base64 images to drastically reduce payload size
      const targetPagesList = activePageData ? [activePageData] : pages;
      const lightweightPages = targetPagesList.map(p => ({
        pageNumber: p.pageNumber,
        viewport: p.viewport,
        image: "" // Strip the massive base64 image data to avoid huge payload size issues and timeouts
      }));

      const projectKpdf = {
        version: "1.0",
        pages: lightweightPages,
        canvases: {
          [activePage]: activeCanvas.toJSON()
        }
      };

      // Generate canvas snapshot image as base64 to allow Gemini to visually process page
      const canvasSnapshotUrl = activeCanvas.toDataURL({
        format: 'jpeg',
        quality: 0.85
      });
      if (activeObj) {
        activeCanvas.setActiveObject(activeObj);
        activeCanvas.renderAll();
      }
      const cleanSnapshotBase64 = canvasSnapshotUrl.includes(",") ? canvasSnapshotUrl.split(",")[1] : canvasSnapshotUrl;

      // 2. Send .kpdf and user prompt directly to the AI
      const jsonString = await troubleshootKpdfPage(apiKey, projectKpdf, instruction, cleanSnapshotBase64);
      
      let cleanJsonString = jsonString.trim();
      if (cleanJsonString.startsWith('```')) {
        cleanJsonString = cleanJsonString.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }
      
      let data;
      try {
        data = JSON.parse(cleanJsonString);
      } catch (e) {
        const startIdx = cleanJsonString.indexOf('{');
        const endIdx = cleanJsonString.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          const possibleJson = cleanJsonString.substring(startIdx, endIdx + 1);
          data = JSON.parse(possibleJson);
        } else {
          throw e;
        }
      }

      // 3. Extract canvas state from response and load it back into the page seamlessly
      const canvasJson = data.canvases?.[activePage] || data.canvases?.[String(activePage)] || Object.values(data.canvases || {})[0];

      if (canvasJson) {
        // Save current state to undo history before overwriting
        const history = getPageHistory(activePage);
        history.undoStack.push(JSON.stringify(activeCanvas.toJSON()));
        history.redoStack = [];

        activeCanvas.loadFromJSON(canvasJson, () => {
          try {
            // If the page has an image background, restore it!
            if (activePageData && activePageData.image) {
              window.fabric.Image.fromURL(activePageData.image, (img: any) => {
                try {
                  if (!img) {
                    activeCanvas.renderAll();
                    saveCanvasState(activePage);
                    setEditorState(prev => ({ 
                      ...prev, 
                      isProcessing: false, 
                      statusMessage: 'لاپەڕە بە سەرکەوتوویی ڕێکخرایەوە و چارەسەرکرا!' 
                    }));
                    return;
                  }
                  activeCanvas.setBackgroundImage(img, () => {
                    activeCanvas.renderAll();
                    saveCanvasState(activePage);
                    setEditorState(prev => ({ 
                      ...prev, 
                      isProcessing: false, 
                      statusMessage: 'لاپەڕە بە سەرکەوتوویی ڕێکخرایەوە و چارەسەرکرا!' 
                    }));
                  }, {
                    scaleX: activeCanvas.width! / (img.width || 1),
                    scaleY: activeCanvas.height! / (img.height || 1)
                  });
                } catch (innerErr: any) {
                  console.error("Error setting background image asynchronously:", innerErr);
                  activeCanvas.renderAll();
                  saveCanvasState(activePage);
                  setEditorState(prev => ({ 
                    ...prev, 
                    isProcessing: false, 
                    statusMessage: 'لاپەڕە بە سەرکەوتوویی ڕێکخرایەوە و چارەسەرکرا!' 
                  }));
                }
              });
            } else {
              activeCanvas.renderAll();
              saveCanvasState(activePage);
              setEditorState(prev => ({ 
                ...prev, 
                isProcessing: false, 
                statusMessage: 'لاپەڕە بە سەرکەوتوویی ڕێکخرایەوە و چارەسەرکرا!' 
              }));
            }
          } catch (loadErr: any) {
            console.error("Error inside loadFromJSON callback:", loadErr);
            activeCanvas.renderAll();
            saveCanvasState(activePage);
            setEditorState(prev => ({ 
              ...prev, 
              isProcessing: false, 
              statusMessage: 'لاپەڕە بە سەرکەوتوویی ڕێکخرایەوە و چارەسەرکرا!' 
            }));
          }
        });
      } else {
        throw new Error("داتای لاپەڕەی نوێ نەدۆزرایەوە لە وەڵامی ژیریی دەستکرددا.");
      }
    } catch (error: any) {
      console.error("Troubleshooting layout failed:", error);
      alert("کێشەیەک ڕوویدا لە چارەسەرکردندا: " + (error.message || error));
      setEditorState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        statusMessage: null 
      }));
    }
  };

  // Helper to add text to canvas
  const addTextToCanvas = (text: string) => {
    const activeCanvas = canvasesRef.current[activePage];
    if (activeCanvas && window.fabric) {
      const activeObj = activeCanvas.getActiveObject();
      if (activeObj && (activeObj.isType('i-text') || activeObj.isType('text') || activeObj.isType('textbox') || activeObj.type === 'textbox')) {
        const currentText = activeObj.text || '';
        const { plainText, styles: parsedStyles } = parseHtmlStyles(text);
        
        let newText = '';
        if (currentText === 'بنڤیسە') {
          newText = plainText;
          // Apply new styles directly
          activeObj.set('styles', parsedStyles);
        } else {
          const originalLines = currentText.split('\n');
          const lastLineIndex = originalLines.length - 1;
          const lastLineCharCount = originalLines[lastLineIndex].length;
          
          // The appended text is ' ' + plainText
          const { plainText: appendedPlain, styles: appendedStyles } = parseHtmlStyles(' ' + text);
          
          if (!activeObj.styles) {
            activeObj.styles = {};
          }
          
          Object.keys(appendedStyles).forEach((lStr) => {
            const l = parseInt(lStr, 10);
            const targetLine = lastLineIndex + l;
            if (!activeObj.styles[targetLine]) {
              activeObj.styles[targetLine] = {};
            }
            const offset = (l === 0) ? lastLineCharCount : 0;
            Object.keys(appendedStyles[l]).forEach((cStr) => {
              const c = parseInt(cStr, 10);
              activeObj.styles[targetLine][c + offset] = appendedStyles[l][c];
            });
          });
          newText = currentText + appendedPlain;
        }
        
        activeObj.set('text', newText);
        activeObj.rawHtmlText = (activeObj.rawHtmlText || currentText) + ' ' + text;
        activeCanvas.renderAll();
        return;
      }

      const { plainText, styles: parsedStyles } = parseHtmlStyles(text);
      const iText = new window.fabric.Textbox(plainText, {
        left: 50,
        top: 50,
        fontSize: 18,
        fill: editorState.strokeColor,
        fontFamily: 'Noto Sans Arabic',
        textAlign: 'right',
        width: 350,
        splitByGrapheme: true,
        minWidth: 10,
        styles: parsedStyles
      });
      iText.rawHtmlText = text;
      activeCanvas.add(iText);
      activeCanvas.setActiveObject(iText);
      activeCanvas.renderAll();
      setEditorState(prev => ({...prev, activeTool: 'select'})); 
    }
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.kpdf') || file.name.endsWith('.json') || file.type === 'application/json') {
      setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...پڕۆژەی دەستکاریکراو (ڤێکتۆر) باردەکرێت' }));
      try {
        const text = await file.text();
        const project = JSON.parse(text);
        if (project && project.pages && project.canvases) {
          pendingCanvasesRef.current = project.canvases;
          setPages(project.pages);
          setActivePage(1);
        } else {
          alert('کێشەیەک هەیە: پڕۆژەکە دروست نییە یان فایلەکە تێکچووە');
        }
      } catch (err: any) {
        console.error(err);
        alert('شکستی هێنا لە بارکردنی فایلی پڕۆژە: ' + err.message);
      } finally {
        setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
        e.target.value = ''; // Reset input
      }
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...PDF تێتە بارکرن' }));

    try {
      const pdfDoc = await loadPDFDocument(file);
      pdfDocRef.current = pdfDoc;
      
      const numPages = pdfDoc.numPages;
      const newPages: PageData[] = [];

      for (let i = 1; i <= numPages; i++) {
        const { dataUrl, viewport } = await renderPDFPageToDataURL(pdfDoc, i);
        newPages.push({
          pageNumber: i,
          viewport,
          image: dataUrl
        });
      }

      setPages(newPages);
      setActivePage(1);
    } catch (err) {
      console.error(err);
      alert('Failed to load PDF');
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (f) => {
      const data = f.target?.result;
      const activeCanvas = canvasesRef.current[activePage];
      if (activeCanvas && typeof data === 'string') {
        window.fabric.Image.fromURL(data, (img: any) => {
            const maxDimension = 300;
            let scale = 1;
            if (img.width > maxDimension || img.height > maxDimension) {
                scale = Math.min(maxDimension / img.width, maxDimension / img.height);
            }
            
            img.set({
                left: activeCanvas.width / 2 - (img.width * scale) / 2,
                top: activeCanvas.height / 2 - (img.height * scale) / 2,
                scaleX: scale,
                scaleY: scale
            });

            activeCanvas.add(img);
            activeCanvas.setActiveObject(img);
            activeCanvas.renderAll();
            
            setEditorState(prev => ({ ...prev, activeTool: 'select' }));
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; 
  };

  const handleToolChange = (tool: ToolType) => {
    setEditorState(prev => ({ ...prev, activeTool: tool }));
    if (tool === 'eraser') {
        const activeCanvas = canvasesRef.current[activePage];
        if (activeCanvas) {
            const activeObj = activeCanvas.getActiveObject();
            if (activeObj) {
                activeCanvas.remove(activeObj);
                activeCanvas.renderAll();
            }
        }
        setEditorState(prev => ({ ...prev, activeTool: 'select' }));
    }
  };

  const handleAddElementToCanvas = (elementType: string) => {
    const activeCanvas = canvasesRef.current[activePage];
    if (!activeCanvas || !window.fabric) return;
    
    const center = activeCanvas.getVpCenter();
    const strokeColor = editorState.strokeColor;
    const strokeWidth = editorState.strokeWidth;
    
    let newObj: any = null;
    
    if (elementType === 'square') {
      newObj = new window.fabric.Rect({
        left: center.x - 50,
        top: center.y - 50,
        width: 100,
        height: 100,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: true
      });
    } else if (elementType === 'rectangle') {
      newObj = new window.fabric.Rect({
        left: center.x - 75,
        top: center.y - 50,
        width: 150,
        height: 100,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: true
      });
    } else if (elementType === 'circle') {
      newObj = new window.fabric.Circle({
        left: center.x - 50,
        top: center.y - 50,
        radius: 50,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: true
      });
    } else if (elementType === 'line') {
      newObj = new window.fabric.Line([center.x - 75, center.y, center.x + 75, center.y], {
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: true
      });
    } else if (elementType === 'rhombus') {
      const width = 100;
      const height = 100;
      const points = [
        { x: width / 2, y: 0 },
        { x: width, y: height / 2 },
        { x: width / 2, y: height },
        { x: 0, y: height / 2 }
      ];
      newObj = new window.fabric.Polygon(points, {
        left: center.x - width / 2,
        top: center.y - height / 2,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: true
      });
    } else if (elementType === 'arrow') {
      newObj = new window.fabric.Path('M 0 10 L 80 10 M 80 10 L 65 0 M 80 10 L 65 20', {
        left: center.x - 40,
        top: center.y - 10,
        fill: 'transparent',
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        strokeUniform: true,
        selectable: true
      });
      newObj.set({ scaleX: 1.5, scaleY: 1.5 });
    } else if (elementType === 'table') {
      newObj = createTableGroup(3, 3, 4, 110, 40, Array(9).fill(''), center.x, center.y, strokeColor, strokeWidth);
    } else if (elementType === 'graph') {
      newObj = createGraphFabricGroup(center.x, center.y, {
        lineColor: strokeColor
      });
    }
    
    if (newObj) {
      activeCanvas.add(newObj);
      activeCanvas.setActiveObject(newObj);
      activeCanvas.renderAll();
      saveCanvasState(activePage);
      setEditorState(prev => ({ ...prev, activeTool: 'select' }));
    }
  };

  const handleAddMathSymbolToCanvas = (symbolType: string) => {
    const activeCanvas = canvasesRef.current[activePage];
    if (!activeCanvas || !window.fabric) return;
    
    const center = activeCanvas.getVpCenter();
    const textColor = editorState.strokeColor || '#1f2937';
    
    const newObj = createMathSymbolGroup(symbolType, center.x, center.y, textColor);
    if (newObj) {
      activeCanvas.add(newObj);
      activeCanvas.setActiveObject(newObj);
      activeCanvas.renderAll();
      saveCanvasState(activePage);
      setEditorState(prev => ({ ...prev, activeTool: 'select' }));
    }
  };

  const scrollToPage = (pageNumber: number) => {
    setActivePage(pageNumber);
    const element = document.getElementById(`page-${pageNumber}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleCanvasReady = (pageNumber: number, canvas: any) => {
    canvasesRef.current[pageNumber] = canvas;
    if (pendingCanvasesRef.current && pendingCanvasesRef.current[pageNumber]) {
      const canvasJson = pendingCanvasesRef.current[pageNumber];
      canvas.loadFromJSON(canvasJson, () => {
        const page = pages.find(p => p.pageNumber === pageNumber);
        if (page && page.image) {
          window.fabric.Image.fromURL(page.image, (img: any) => {
            canvas.setBackgroundImage(img, () => {
              canvas.renderAll();
              // Save initial state to history stack after loading JSON and background
              const history = getPageHistory(pageNumber);
              if (history.undoStack.length === 0) {
                history.undoStack.push(JSON.stringify(canvas.toJSON()));
                setForceUpdate(prev => prev + 1);
              }
            }, {
              scaleX: canvas.width! / img.width!,
              scaleY: canvas.height! / img.height!
            });
          });
        } else {
          canvas.renderAll();
          // Save initial state to history stack after loading JSON
          const history = getPageHistory(pageNumber);
          if (history.undoStack.length === 0) {
            history.undoStack.push(JSON.stringify(canvas.toJSON()));
            setForceUpdate(prev => prev + 1);
          }
        }
      });
    } else {
      // Save initial empty state to history stack
      setTimeout(() => {
        if (canvasesRef.current[pageNumber]) {
          const history = getPageHistory(pageNumber);
          if (history.undoStack.length === 0) {
            history.undoStack.push(JSON.stringify(canvasesRef.current[pageNumber].toJSON()));
            setForceUpdate(prev => prev + 1);
          }
        }
      }, 500);
    }
  };

  const handleExport = async () => {
      if (!window.jspdf) {
          alert("JSPDF library not loaded");
          return;
      }

      setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...PDF تێتە دروستکرن' }));

      try {
          const { jsPDF } = window.jspdf;
          const firstPage = pages[0];
          const orientation = firstPage && firstPage.viewport.width > firstPage.viewport.height ? 'l' : 'p';
          
          const doc = new jsPDF({
              orientation: orientation,
              unit: 'px',
              format: [firstPage.viewport.width, firstPage.viewport.height]
          });

          for (let i = 0; i < pages.length; i++) {
              const page = pages[i];
              const canvas = canvasesRef.current[page.pageNumber];
              
              if (!canvas) continue;

              canvas.discardActiveObject();
              canvas.renderAll();

              const dataURL = canvas.toDataURL({
                  format: 'jpeg',
                  quality: 0.8,
                  multiplier: 1 
              });

              if (i > 0) {
                  doc.addPage([page.viewport.width, page.viewport.height]);
              }
              
              doc.addImage(dataURL, 'JPEG', 0, 0, page.viewport.width, page.viewport.height);
          }

          doc.save("edited-document.pdf");

          // Auto upload to Google Drive if connected
          const pdfArrayBuffer = doc.output('arraybuffer');
          const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
          const filename = (saveTitle || "edited-document") + ".pdf";
          await autoUploadToDriveIfConnected(pdfBlob, filename, 'application/pdf');

      } catch (e) {
          console.error(e);
          alert("Error exporting PDF");
      } finally {
          setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
      }
  };

  const handleExportFullQuality = async () => {
      if (!window.jspdf) {
          alert("JSPDF library not loaded");
          return;
      }

      setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...PDF ب کوالێتیا فول تێتە دروستکرن (Full Quality)' }));

      try {
          const { jsPDF } = window.jspdf;
          const firstPage = pages[0];
          const orientation = firstPage && firstPage.viewport.width > firstPage.viewport.height ? 'l' : 'p';
          
          const doc = new jsPDF({
              orientation: orientation,
              unit: 'px',
              format: [firstPage.viewport.width, firstPage.viewport.height]
          });

          for (let i = 0; i < pages.length; i++) {
              const page = pages[i];
              const canvas = canvasesRef.current[page.pageNumber];
              
              if (!canvas) continue;

              canvas.discardActiveObject();
              canvas.renderAll();

              // For full quality, use multiplier: 2 and high quality PNG
              const dataURL = canvas.toDataURL({
                  format: 'png',
                  quality: 1.0,
                  multiplier: 2 
              });

              if (i > 0) {
                  doc.addPage([page.viewport.width, page.viewport.height]);
              }
              
              doc.addImage(dataURL, 'PNG', 0, 0, page.viewport.width, page.viewport.height);
          }

          doc.save("edited-document-full-quality.pdf");

          // Auto upload to Google Drive if connected
          const pdfArrayBuffer = doc.output('arraybuffer');
          const pdfBlob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
          const filename = (saveTitle || "edited-document-full-quality") + ".pdf";
          await autoUploadToDriveIfConnected(pdfBlob, filename, 'application/pdf');

      } catch (e) {
          console.error(e);
          alert("کێشەیەک لە دروستکردنی PDF دروست بوو");
      } finally {
          setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
      }
  };

  const handleSaveProject = async () => {
    if (pages.length === 0) {
      alert("هیچ لاپەڕەیەک نییە بۆ پاشەکەوتکردن");
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...پاشەکەوتکردنی پڕۆژەی ڤێکتۆر' }));

    try {
      // Discard active objects to avoid saving selection box
      Object.values(canvasesRef.current).forEach(canvas => {
        if (canvas) {
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      });

      const projectData = {
        version: "1.0",
        pages: pages,
        canvases: Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
          const canvas = canvasesRef.current[Number(pageNum)];
          if (canvas) {
            acc[Number(pageNum)] = canvas.toJSON();
          }
          return acc;
        }, {} as Record<number, any>)
      };

      const blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "edited-project.kpdf";
      a.click();
      URL.revokeObjectURL(url);

      // Auto upload to Google Drive if connected
      const filename = (saveTitle || "edited-project") + ".kpdf";
      await autoUploadToDriveIfConnected(blob, filename, 'application/json');
    } catch (err: any) {
      console.error(err);
      alert("شکستی هێنا لە پاشەکەوتکردنی پڕۆژە: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const showAuthErrorAlert = (err: any, customContext: string = "چوونەژوورەوە") => {
    console.error("Auth error:", err);
    const code = err?.code || '';
    const message = err?.message || '';

    if (code === 'auth/operation-not-allowed' || message.includes('operation-not-allowed')) {
      alert(`⚠️ خەتایا چوونەژوورێ (Operation Not Allowed)!

ئەڤ خەتایە ژ لایێ Firebase ڤە دهێت چونکی شێوازێ چوونەژوورێ (Email/Password یان Google) د ناو پرۆژەیێ تە دا ل سەر کۆنسۆلا Firebase نەهاتیە چالاککرن (Enabled).

بۆ چارەسەرکرنا ڤێ خەتایێ، ئەڤان گاڤان ئەنجام بدە:
١. بچۆ ناڤ مالپەڕێ کۆنسۆلا فایەربەیس: https://console.firebase.google.com
٢. پرۆژەیێ خۆ یێ فایەربەیس (Firebase Project) هەلبژێرە.
٣. د بەشێ چەپێ دا کلیک ل سەر "Authentication" بکە.
٤. بچۆ بەشێ "Sign-in method" (د سەر سکرینێ دا).
٥. ل بەشێ "Sign-in providers"، کلیک ل سەر "Email/Password" بکە و "Enable" بکە، و پاشان کلیک ل سەر "Save" بکە.
٦. هەر ل وێرێ، ئەگەر دڤێت ب رێیا جیمێل بچییە ژوور، کلیک ل سەر "Google" بکە و "Enable" بکە و Save بکە.

ئەڤە خەتایەکا کۆدێ تەیێ مالپەڕی نینە، بەلکۆ پێویستە تو ڤان تەنزیماتان د فایەربەیسا خۆ دا کارا بکەی.`);
    } else if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain') || message.includes('auth/domain-not-allowed')) {
      alert(`⚠️ خەتایا ناونیشانێ مالپەڕی (Unauthorized Domain)!

ئەڤ خەتایە دهێت چونکی ناونیشانێ مالپەڕێ تە (pdfhusseinn.netlify.app یان یێ دی) نەهاتیە تۆمارکرن د لیستا ڕێپێدراوان دا ل سەر Firebase.

بۆ چارەسەرکرنا ڤێ خەتایێ:
١. بچۆ کۆنسۆلا فایەربەیس: https://console.firebase.google.com
٢. پرۆژەیێ خۆ هەلبژێرە و بچۆ بەشێ "Authentication".
٣. کلیک ل سەر تابلۆیا "Settings" بکە (د تەنیشت Sign-in method).
٤. ل لیستا لایێ چەپ، بچۆ سەر "Authorized domains".
٥. کلیک ل سەر "Add domain" بکە و ناونیشانێ مالپەڕێ خۆ یێ نەتلیفای یان گیتهەب بنڤیسە (بۆ نموونە: pdfhusseinn.netlify.app) و پاشان Add بکە.`);
    } else {
      alert(`خەتا د ${customContext} دا ڕوویدا:\n${message || err}`);
    }
  };

  const handleStartNewProject = () => {
    // Clear fabric canvas instances from canvasesRef
    Object.values(canvasesRef.current).forEach(canvas => {
      if (canvas) {
        canvas.clear();
      }
    });
    canvasesRef.current = {};
    canvasHistoryRef.current = {};
    pdfDocRef.current = null;
    pendingCanvasesRef.current = null;
    
    // Clear pages to show welcome starter screen
    setPages([]);
    setActivePage(1);
    setSaveTitle('');
    localStorage.removeItem('kurdish_pdf_active_draft');
  };

  const handlePublishAndNewProject = async () => {
    if (!auth.currentUser) {
      alert("تکایە سەرەتا بچۆ ژوورەوە یان وەک مێوان تۆمار بکە بۆ بڵاوکردنەوەی پڕۆژەی (Please login or join as guest to publish)");
      setProjectsTab('my');
      setShowProjectsModal(true);
      return;
    }
    if (pages.length === 0) {
      alert("هیچ لاپەڕەیەک نییە بۆ بڵاوکردنەوە (No pages to publish)");
      return;
    }

    const title = prompt("ناونیشانێک بنووسە بۆ بڵاوکردنەوەی پڕۆژەکەت (Enter a name to publish this project):", saveTitle || "");
    if (title === null) return; // User cancelled
    
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      alert("تکایە ناونیشانەکێ بنڤیسە بۆ پڕۆژەی (Project name is required)");
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...پاشەکەوتکردن و بڵاوکردنەوە (Publishing & Resetting)...' }));

    try {
      // 1. Discard active objects
      Object.values(canvasesRef.current).forEach(canvas => {
        if (canvas) {
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      });

      const canvasData = Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
        const canvas = canvasesRef.current[Number(pageNum)];
        if (canvas) {
          acc[Number(pageNum)] = canvas.toJSON();
        }
        return acc;
      }, {} as Record<number, any>);

      const projectId = `proj-${Date.now()}`;
      
      // 2. Save project as a cloud project
      await saveProjectToCloud(projectId, trimmedTitle, pages, canvasData);

      // Auto upload to Google Drive if connected
      const projectDataForDrive = {
        version: "1.0",
        pages: pages,
        canvases: canvasData
      };
      const blob = new Blob([JSON.stringify(projectDataForDrive)], { type: 'application/json' });
      const driveFilename = trimmedTitle + ".kpdf";
      await autoUploadToDriveIfConnected(blob, driveFilename, 'application/json');

      // 3. Request public publish
      await requestProjectPublish(projectId, auth.currentUser.displayName || "کۆدکار", auth.currentUser.email || "guest@kpdf.local");

      // 4. Refresh projects lists
      await loadAllCloudData();

      alert("پڕۆژەکە بە سەرکەوتوویی پاشەکەوت کرا و نێردرا بۆ بەشی پەسەندکردنی ئەدمین! ئێستا پڕۆژەیەکی نوێ دەستپێدەکات. 🎉");

      // 5. Start a completely new blank project!
      handleStartNewProject();
    } catch (err: any) {
      console.error("Publish and reset failed:", err);
      alert("شکستی هێنا لە بڵاوکردنەوە: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleSaveProjectToCloud = async (customTitle?: string) => {
    if (!auth.currentUser) {
      alert("تکایە سەرەتا بچۆ ژوورەوە بۆ پاشەکەوتکردن ل سەر سحابێ");
      return;
    }
    if (pages.length === 0) {
      alert("هیچ لاپەڕەیەک نییە بۆ پاشەکەوتکردن");
      return;
    }

    const title = (customTitle || saveTitle || `پڕۆژەی ${new Date().toLocaleDateString('ku-IQ')}`).trim();
    if (!title) {
      alert("تکایە ناونیشانەک بۆ پڕۆژەی بنووسە");
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...پاشەکەوتکردن ل سەر سحابێ (Saving to Cloud)' }));

    try {
      // Discard active objects
      Object.values(canvasesRef.current).forEach(canvas => {
        if (canvas) {
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      });

      const canvasData = Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
        const canvas = canvasesRef.current[Number(pageNum)];
        if (canvas) {
          acc[Number(pageNum)] = canvas.toJSON();
        }
        return acc;
      }, {} as Record<number, any>);

      const projectId = `proj-${Date.now()}`;
      await saveProjectToCloud(projectId, title, pages, canvasData);
      
      // Auto upload to Google Drive if connected
      const projectDataForDrive = {
        version: "1.0",
        pages: pages,
        canvases: canvasData
      };
      const blob = new Blob([JSON.stringify(projectDataForDrive)], { type: 'application/json' });
      const driveFilename = title + ".kpdf";
      await autoUploadToDriveIfConnected(blob, driveFilename, 'application/json');

      // Refresh projects list
      const updatedProjs = await getCloudProjects();
      setCloudProjects(updatedProjs);
      setSaveTitle('');
      alert("پڕۆژە بە سەرکەوتوویی لەسەر سحاب پاشەکەوت کرا! 🎉");
    } catch (err: any) {
      console.error("Cloud save failed:", err);
      alert("شکستی هێنا لە پاشەکەوتکردن لەسەر سحاب: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleLoadProjectFromCloud = (project: CloudProject) => {
    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...پڕۆژەی دەستکاریکراو باردەکرێت' }));
    try {
      if (project && project.pages && project.canvases) {
        pendingCanvasesRef.current = project.canvases;
        setPages(project.pages);
        setActivePage(1);

        // Check ownership
        const isCurrentOwner = auth.currentUser && project.userId === auth.currentUser.uid;
        if (isCurrentOwner) {
          setSaveTitle(project.title);
          alert(`پڕۆژەی "${project.title}" بە سەرکەوتوویی بارکرا! 🎉`);
        } else {
          // Loaded as template copy
          const copyTitle = `${project.title} (کۆپی)`;
          setSaveTitle(copyTitle);
          alert(`پڕۆژەی نموونە "${project.title}" وەک کۆپی بارکرا! دەتونیت دەستکاری بکەیت و پاشەکەوتی بکەیت وەک پڕۆژەیەکی نوێ لە ئەکاونتی خۆتدا. 🎉`);
        }
      } else {
        alert('کێشەیەک هەیە: پڕۆژەکە دروست نییە یان فایلەکە تێکچووە');
      }
    } catch (err: any) {
      console.error(err);
      alert('شکستی هێنا لە بارکردنی پڕۆژە: ' + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleConnectDrive = async () => {
    setIsDriveLoading(true);
    setDriveError(null);
    try {
      const user = await signInWithGoogle();
      const token = getGoogleAccessToken();
      if (token) {
        await handleLoadDriveFiles(token);
      } else {
        setDriveError("پەیوەندیکردن بە گووگڵ درایڤ سەرکەوتوو نەبوو.");
      }
    } catch (err: any) {
      console.error("Error connecting to Google Drive:", err);
      setDriveError("کێشەیەک لە پەیوەستبوون بە گووگڵ درایڤ دروست بوو: " + (err?.message || err));
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleLoadDriveFiles = async (token: string, searchName?: string) => {
    setIsDriveLoading(true);
    setDriveError(null);
    try {
      const files = await listDriveFiles(token, searchName);
      setDriveFiles(files);
    } catch (err: any) {
      console.error("Error listing Drive files:", err);
      setDriveError("شکستی هێنا لە بارکردنی فایلەکان: " + (err?.message || err));
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleOpenDriveFile = async (file: DriveFile) => {
    const token = getGoogleAccessToken();
    if (!token) return;

    const confirmOpen = window.confirm(`تۆ دڵنیای دەتەوێت فایلی "${file.name}" بکەیتەوە؟ پڕۆژەی ئێستات دادەخرێت.`);
    if (!confirmOpen) return;

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...داگرتنی فایل لە گووگڵ درایڤ' }));
    try {
      const blob = await downloadDriveFile(token, file.id);
      
      if (file.name.endsWith('.kpdf') || file.name.endsWith('.json') || file.mimeType === 'application/json') {
        const text = await blob.text();
        const project = JSON.parse(text);
        if (project && project.pages && project.canvases) {
          pendingCanvasesRef.current = project.canvases;
          setPages(project.pages);
          setActivePage(1);
          setSaveTitle(file.name.replace(/\.(kpdf|json)$/i, ''));
          setShowDriveModal(false);
        } else {
          alert('کێشەیەک هەیە: پڕۆژەکە دروست نییە یان فایلەکە تێکچووە');
        }
      } else {
        const arrayBuffer = await blob.arrayBuffer();
        const pdfDoc = await loadPDFDocument(arrayBuffer);
        pdfDocRef.current = pdfDoc;
        
        const numPages = pdfDoc.numPages;
        const newPages: PageData[] = [];

        for (let i = 1; i <= numPages; i++) {
          const { dataUrl, viewport } = await renderPDFPageToDataURL(pdfDoc, i);
          newPages.push({
            pageNumber: i,
            viewport,
            image: dataUrl
          });
        }

        setPages(newPages);
        setActivePage(1);
        setSaveTitle(file.name.replace(/\.pdf$/i, ''));
        setShowDriveModal(false);
      }
    } catch (err: any) {
      console.error("Error opening Drive file:", err);
      alert("شکستی هێنا لە چوونەناوەوەی فایلەکە: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleSaveToDrive = async (filename: string, fileType: 'pdf' | 'kpdf') => {
    const token = getGoogleAccessToken();
    if (!token) {
      alert("تکایە سەرەتا پەیوەست ببن بە گووگڵ درایڤ.");
      return;
    }

    if (!filename.trim()) {
      alert("تکایە ناوێک بۆ فایلەکە دابنێ.");
      return;
    }

    const confirmSave = window.confirm(`تۆ دڵنیای دەتەوێت فایلی "${filename}" پاشەکەوت بکەیت لە گووگڵ درایڤ؟`);
    if (!confirmSave) return;

    setIsSavingToDrive(true);
    try {
      let blob: Blob;
      let mimeType: string;
      let finalFilename = filename;

      if (fileType === 'pdf') {
        if (!window.jspdf) {
          throw new Error("JSPDF library not loaded");
        }
        if (!finalFilename.toLowerCase().endsWith('.pdf')) {
          finalFilename += '.pdf';
        }
        mimeType = 'application/pdf';

        const { jsPDF } = window.jspdf;
        const firstPage = pages[0];
        const orientation = firstPage && firstPage.viewport.width > firstPage.viewport.height ? 'l' : 'p';
        
        const doc = new jsPDF({
          orientation: orientation,
          unit: 'px',
          format: [firstPage.viewport.width, firstPage.viewport.height]
        });

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const canvas = canvasesRef.current[page.pageNumber];
          
          if (!canvas) continue;

          canvas.discardActiveObject();
          canvas.renderAll();

          const dataURL = canvas.toDataURL({
            format: 'jpeg',
            quality: 0.8,
            multiplier: 1 
          });

          if (i > 0) {
            doc.addPage([page.viewport.width, page.viewport.height]);
          }
          
          doc.addImage(dataURL, 'JPEG', 0, 0, page.viewport.width, page.viewport.height);
        }

        const pdfArrayBuffer = doc.output('arraybuffer');
        blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });

      } else {
        if (!finalFilename.toLowerCase().endsWith('.kpdf')) {
          finalFilename += '.kpdf';
        }
        mimeType = 'application/json';

        Object.values(canvasesRef.current).forEach(canvas => {
          if (canvas) {
            canvas.discardActiveObject();
            canvas.renderAll();
          }
        });

        const projectData = {
          version: "1.0",
          pages: pages,
          canvases: Object.keys(canvasesRef.current).reduce((acc, pageNum) => {
            const canvas = canvasesRef.current[Number(pageNum)];
            if (canvas) {
              acc[Number(pageNum)] = canvas.toJSON();
            }
            return acc;
          }, {} as Record<number, any>)
        };

        blob = new Blob([JSON.stringify(projectData)], { type: 'application/json' });
      }

      await uploadDriveFile(token, finalFilename, mimeType, blob);
      alert(`سەرکەوتووانە فایلی "${finalFilename}" پاشەکەوتکرا لە گووگڵ درایڤ!`);
      await handleLoadDriveFiles(token);
    } catch (err: any) {
      console.error("Error saving to Drive:", err);
      alert("شکستی هێنا لە پاشەکەوتکردنی فایلەکە: " + err.message);
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const autoUploadToDriveIfConnected = async (blob: Blob, name: string, mimeType: string) => {
    const token = getGoogleAccessToken();
    if (!token) return;
    
    try {
      await uploadDriveFile(token, name, mimeType, blob);
      console.log(`Auto-uploaded "${name}" to Google Drive successfully!`);
    } catch (err: any) {
      console.error(`Failed to auto-upload "${name}" to Google Drive:`, err);
    }
  };

  const handleTogglePublish = async (project: CloudProject) => {
    if (!auth.currentUser) return;
    const isCurrentlyPublished = project.isPublished === true;
    const actionText = isCurrentlyPublished ? "لابردنی بڵاوکردنەوە" : "بڵاوکردنەوە بۆ هەمووان";
    if (!window.confirm(`ئایا دڵنیایت دەتەوێت "${project.title}" ${actionText} بکەیت؟`)) {
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...نوێکردنەوەی دۆخی بڵاوکردنەوە' }));
    try {
      await approveProjectPublish(project.id, !isCurrentlyPublished);
      
      // Refresh list
      await loadAllCloudData();

      alert(`دۆخی پڕۆژەکە بە سەرکەوتوویی نوێکرایەوە بۆ: ${!isCurrentlyPublished ? 'بڵاوکراوە وەک نموونەی گشتی' : 'تەنها تایبەت'}`);
    } catch (err: any) {
      console.error("Toggle publish failed:", err);
      alert("شکست هێنا لە گۆڕینی دۆخی بڵاوکردنەوە: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleRequestPublish = async (project: CloudProject) => {
    if (!auth.currentUser) return;
    const name = prompt("تکایە ناڤێ خۆ یان تێکستەکێ ناساندن بنڤیسە بۆ بەڵاڤکرنێ لسەر ناڤێ تە:", auth.currentUser.displayName || "کۆدکار");
    if (name === null) return; // cancelled
    
    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...ناردنی داواکارییا بەڵاڤکرنێ' }));
    try {
      await requestProjectPublish(project.id, name || "کۆدکار", auth.currentUser.email || "");
      await loadAllCloudData();
      alert("داواکارییا تە ب سەرکەوتوویی بۆ ئەدمینی هاتە فرێکرن! دێ هێتە بەڵاڤکرن پشتی ئەدمین پەسەند دکەتن. 🎉");
    } catch (err: any) {
      console.error("Request publish failed:", err);
      alert("خەتا د فرێکرنا داواکاریێ دا: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleApprovePublish = async (project: CloudProject, isApproved: boolean) => {
    if (!auth.currentUser) return;
    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...نوێکردنەوەی بڕیارا بڵاوکردنەوەی ئەدمین' }));
    try {
      await approveProjectPublish(project.id, isApproved);
      await loadAllCloudData();
      alert(isApproved ? "پڕۆژە ب سەرکەوتوویی هاتە پەسەندکرن و بەڵاڤکرن! 🚀" : "پڕۆژە هاتە ڕەتکرن.");
    } catch (err: any) {
      console.error("Admin decision failed:", err);
      alert("خەتا د پەسەندکرنێ دا: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleDeleteProjectFromCloud = async (projectId: string, title: string) => {
    if (!auth.currentUser) return;
    if (!window.confirm(`ئەرێ تو دڵنیایی دەتەوێت پڕۆژەی "${title}" بسڕیتەوە؟`)) {
      return;
    }

    setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: '...سڕینەوەی پڕۆژە لەسەر سحاب' }));
    try {
      await deleteProjectFromCloud(projectId);
      await loadAllCloudData();
      alert("پڕۆژەکە بە سەرکەوتوویی سڕایەوە.");
    } catch (err: any) {
      console.error(err);
      alert("sڕینەوەی پڕۆژە سەرکەوتوو نەبوو: " + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
    }
  };

  const handleAddPage = () => {
    const width = 595;
    const height = 842;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }

    const newPageNumber = pages.length + 1;
    const newPage: PageData = {
      pageNumber: newPageNumber,
      viewport: { width, height },
      image: canvas.toDataURL('image/jpeg')
    };

    setPages(prev => [...prev, newPage]);
    
    setTimeout(() => {
        scrollToPage(newPageNumber);
    }, 100);
  };

  const handleDeletePage = (pageNumber: number) => {
      if(!confirm(`دڵنیای لە سڕینەوەی لاپەڕەی ${pageNumber}?`)) return;
      
      const newPages = pages.filter(p => p.pageNumber !== pageNumber);
      const reordered = newPages.map((p, idx) => ({...p, pageNumber: idx + 1}));
      
      setPages(reordered);
      delete canvasesRef.current[pageNumber];
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900">
      <ThemeStyleInjector theme={appTheme} />

      {/* Hidden Input for OCR */}
      <input 
        type="file" 
        ref={ocrInputRef}
        onChange={handleOcrFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Loading Overlay */}
      {editorState.isProcessing && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <p className="text-xl">{editorState.statusMessage}</p>
        </div>
      )}

      {/* Settings Modal (Design & AI Settings) */}
      {showApiModal && (
        <div className="fixed inset-0 bg-black/90 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-gray-750 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative text-right">
            
            {/* Modal Title */}
            <h3 className="text-xl font-bold text-white mb-5 flex items-center justify-start gap-2 border-b border-gray-700 pb-3" dir="rtl">
              <Icons.Settings className="text-primary" />
              <span>ڕێکخستنێن گشتی و دیزاینی</span>
            </h3>

            {/* Tab Navigation */}
            <div className="flex gap-2 mb-6 bg-black/40 p-1 rounded-lg" dir="rtl">
              <button 
                onClick={() => setSettingsTab('design')}
                className={`flex-1 py-2 rounded-md font-bold text-xs transition-all ${settingsTab === 'design' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                تێم و دیزاین (Theme & Design)
              </button>
              <button 
                onClick={() => setSettingsTab('ai')}
                className={`flex-1 py-2 rounded-md font-bold text-xs transition-all ${settingsTab === 'ai' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                ژیریێ دەستکرد (AI Gemini)
              </button>
              <button 
                onClick={() => setSettingsTab('cloud')}
                className={`flex-1 py-2 rounded-md font-bold text-xs transition-all ${settingsTab === 'cloud' ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                کۆگەیا سحابێ (Firebase Cloud)
              </button>
            </div>

            {/* Tab 1: Design Settings */}
            {settingsTab === 'design' && (
              <div className="space-y-6" dir="rtl">
                
                {/* Accent/Color Theme */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-extrabold uppercase tracking-wider block text-right">
                    تێم و دیزاینێ ڕەنگی (Color Theme)
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'indigo', name: 'کۆسمیک', color: 'bg-indigo-600' },
                      { id: 'emerald', name: 'شاهانە', color: 'bg-emerald-600' },
                      { id: 'purple', name: 'ڕووناک', color: 'bg-purple-600' },
                      { id: 'gold', name: 'زێڕینی', color: 'bg-amber-500' },
                      { id: 'slate', name: 'سادە', color: 'bg-zinc-600' }
                    ].map(theme => (
                      <button
                        key={theme.id}
                        onClick={() => saveCustomSettings(iconSize, theme.id, listMarkerStyle)}
                        className={`p-2 rounded-lg border text-center transition-all ${appTheme === theme.id ? 'border-primary bg-primary/10 text-white font-extrabold' : 'border-gray-700 bg-black/20 text-gray-400 hover:border-gray-500'}`}
                      >
                        <div className={`w-4 h-4 rounded-full ${theme.color} mx-auto mb-1`}></div>
                        <span className="text-[10px] block">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Toolbar Icon Size */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-extrabold uppercase tracking-wider block text-right">
                    قەبارەیا ئایکونێن تووڵباری (Icon Size)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { size: 14, label: 'بچووک (Small)' },
                      { size: 18, label: 'ناوەڕاست (Medium)' },
                      { size: 22, label: 'مەزن (Large)' }
                    ].map(opt => (
                      <button
                        key={opt.size}
                        onClick={() => saveCustomSettings(opt.size, appTheme, listMarkerStyle)}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${iconSize === opt.size ? 'border-primary bg-primary/20 text-white font-extrabold' : 'border-gray-700 bg-black/20 text-gray-400 hover:border-gray-500'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Default List Style */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-extrabold uppercase tracking-wider block text-right">
                    شێوازێ نیشاندەرێ لیستان (List Bullet Style)
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { marker: '•', label: '• خاڵ' },
                      { marker: '●', label: '● ڕەق' },
                      { marker: '■', label: '■ چوارگۆشە' },
                      { marker: '★', label: '★ ئەستێرە' },
                      { marker: '✔', label: '✔ نیشان' }
                    ].map(opt => (
                      <button
                        key={opt.marker}
                        onClick={() => saveCustomSettings(iconSize, appTheme, opt.marker)}
                        className={`py-2 px-1 rounded-lg border text-center text-xs transition-all ${listMarkerStyle === opt.marker ? 'border-primary bg-primary/20 text-white font-extrabold' : 'border-gray-700 bg-black/20 text-gray-400 hover:border-gray-500'}`}
                      >
                        <span className="text-base block mb-0.5">{opt.marker}</span>
                        <span className="text-[10px]">{opt.label.split(' ')[1]}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* Tab 2: AI Settings */}
            {settingsTab === 'ai' && (
              <div className="space-y-4 text-right" dir="rtl">
                <p className="text-gray-400 text-sm">
                  تکایە API Key تایبەت بە خۆت دابنێ بۆ بەکارهێنانی تایبەتمەندی دەنگ و OCR.
                  دەتوانیت لە <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 underline">Google AI Studio</a> وەربگریت.
                </p>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => {
                     setApiKey(e.target.value);
                     setApiStatus('idle');
                  }}
                  placeholder="Paste Gemini API Key here..."
                  className={`w-full bg-darker border rounded-lg p-3 text-white focus:outline-none mb-2 text-left
                    ${apiStatus === 'error' ? 'border-red-500' : 
                      apiStatus === 'connected' ? 'border-green-500' : 'border-gray-600 focus:border-primary'}
                  `}
                />
                
                {/* Status Message */}
                <div className="min-h-[24px] text-sm font-bold">
                   {apiStatus === 'validating' && <span className="text-yellow-400">...دڵنیابوونەوە</span>}
                   {apiStatus === 'connected' && <span className="text-green-500">✓ بە سەرکەوتوویی پەیوەست کرا (Connected)</span>}
                   {apiStatus === 'error' && (
                     <div className="flex flex-col gap-1">
                       <span className="text-red-500">✗ هەڵەیە، پەیوەست نابێت</span>
                       {apiErrorMessage && <span className="text-xs text-red-400 font-normal mt-0.5">{apiErrorMessage}</span>}
                     </div>
                   )}
                </div>
              </div>
            )}

            {/* Tab 3: Firebase Cloud Settings */}
            {settingsTab === 'cloud' && (
              <div className="space-y-4 text-right animate-in fade-in duration-200 py-6 text-center" dir="rtl">
                <div className="p-3 bg-blue-500/10 rounded-full text-blue-400 w-max mx-auto mb-2">
                  <Icons.Globe size={32} />
                </div>
                <h4 className="text-sm font-bold text-white">کۆگەیا نیشتمانی یا سحابێ</h4>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  بۆ پاشەکەوتکردن، بارکردن، بڵاوکردنەوەی گشتی و بەڕێوەبردنی پڕۆژەکان لەسەر سحابێ، تکایە پانێڵی تایبەت بەکاربهێنە کە لە بەشی سەرەوەی ڕاست بەردەستە.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowApiModal(false);
                    setShowProjectsModal(true);
                  }}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs shadow-md mt-4 inline-block transition-all hover:scale-105"
                >
                  کردنەوەی دۆڵابی پڕۆژەکان (Open Projects Closet)
                </button>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-between items-center mt-8 border-t border-gray-700 pt-4" dir="rtl">
              <button 
                onClick={() => {
                  saveCustomSettings(18, 'indigo', '•');
                }}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                title="Reset settings to original defaults"
              >
                ڤەگەڕاندن بۆ بنەڕەت (Reset)
              </button>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowApiModal(false)} 
                  className="px-4 py-2 text-xs font-bold bg-gray-800 hover:bg-gray-750 text-white rounded-lg transition-colors"
                >
                  داخستن (Close)
                </button>
                {settingsTab === 'ai' && (
                  <button 
                    onClick={saveApiKey} 
                    disabled={apiStatus === 'validating'}
                    className="px-6 py-2 bg-primary hover:opacity-90 disabled:opacity-50 text-white rounded-lg font-bold text-xs transition-opacity"
                  >
                    پاشەکەوتکرن (Save Key)
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Floating Top Right Unified Projects & Account Menu */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-1 items-end" dir="rtl">
        <button
          onClick={() => setShowTopRightMenu(!showTopRightMenu)}
          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-950/95 border border-zinc-800 text-white rounded-xl shadow-2xl backdrop-blur-md transition-all active:scale-95 text-xs font-black hover:border-zinc-700 hover:bg-zinc-900"
          title="مینیویا کارۆبارێن پڕۆژەی (Projects Menu)"
        >
          <Icons.Menu size={16} className="text-indigo-400" />
          <span>کۆنترۆلا پڕۆژان (مینیو)</span>
          <Icons.ChevronDown size={14} className={`text-zinc-500 transition-transform duration-200 ${showTopRightMenu ? 'rotate-180' : ''}`} />
        </button>

        {showTopRightMenu && (
          <div className="mt-1 bg-zinc-950/95 border border-zinc-800 rounded-2xl p-2 w-64 shadow-2xl backdrop-blur-lg flex flex-col gap-1 animate-in slide-in-from-top-2 duration-150 z-[101]">
            <span className="px-3 py-1.5 text-[10px] text-zinc-500 font-bold border-b border-zinc-900 text-right">ئۆپشنێن سەرەکی یێن پڕۆژان</span>
            
            {/* Button 1: My Projects */}
            <button
              onClick={() => {
                setProjectsTab('my');
                setShowProjectsModal(true);
                setShowTopRightMenu(false);
                loadAllCloudData();
              }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 text-zinc-200 hover:text-white rounded-xl transition-all text-xs font-bold text-right w-full"
            >
              <div className="w-7 h-7 bg-blue-500/15 text-blue-400 rounded-lg flex items-center justify-center">
                <Icons.File size={15} />
              </div>
              <div className="flex flex-col items-start">
                <span>پڕۆژێن من</span>
                <span className="text-[9px] text-zinc-500 font-normal">پڕۆژێن تە ل سەر سحابێ</span>
              </div>
            </button>

            {/* Button 2: Public Projects */}
            <button
              onClick={() => {
                setProjectsTab('public');
                setShowProjectsModal(true);
                setShowTopRightMenu(false);
                loadAllCloudData();
              }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 text-zinc-200 hover:text-white rounded-xl transition-all text-xs font-bold text-right w-full"
            >
              <div className="w-7 h-7 bg-emerald-500/15 text-emerald-400 rounded-lg flex items-center justify-center">
                <Icons.Globe size={15} />
              </div>
              <div className="flex flex-col items-start">
                <span>پڕۆژێن گشتی</span>
                <span className="text-[9px] text-zinc-500 font-normal">پڕۆژێن بەڵاڤکری بۆ هەمووان</span>
              </div>
            </button>

            {/* Button 3: Google Drive */}
            <button
              onClick={() => {
                setShowDriveModal(true);
                setShowTopRightMenu(false);
                const token = getGoogleAccessToken();
                if (token) {
                  handleLoadDriveFiles(token);
                }
              }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 text-zinc-200 hover:text-white rounded-xl transition-all text-xs font-bold text-right w-full"
            >
              <div className="w-7 h-7 bg-amber-500/15 text-amber-500 rounded-lg flex items-center justify-center">
                <Icons.Drive size={15} />
              </div>
              <div className="flex flex-col items-start">
                <span>گووگڵ درایڤ</span>
                <span className="text-[9px] text-zinc-500 font-normal">هەناردە و هاوردەکردنا درایڤ</span>
              </div>
            </button>

            {/* Button 4: Publish & Start New */}
            <button
              onClick={() => {
                setShowTopRightMenu(false);
                handlePublishAndNewProject();
              }}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 text-zinc-200 hover:text-white rounded-xl transition-all text-xs font-bold text-right w-full"
            >
              <div className="w-7 h-7 bg-indigo-500/15 text-indigo-400 rounded-lg flex items-center justify-center">
                <Icons.Send size={15} />
              </div>
              <div className="flex flex-col items-start">
                <span>بڵاوکردنەوە و نوێ</span>
                <span className="text-[9px] text-zinc-500 font-normal">پاشەکەوتکرن و بەڵاڤکرنا فەرمی</span>
              </div>
            </button>

            {/* Admin Pending Requests Notification */}
            {user && user.email === 'hussein.zebary.chemistry96@gmail.com' && (
              <button
                onClick={() => {
                  setProjectsTab('pending');
                  setShowProjectsModal(true);
                  setShowTopRightMenu(false);
                  loadAllCloudData();
                }}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-900 text-zinc-200 hover:text-white rounded-xl transition-all text-xs font-bold text-right w-full border-t border-zinc-900 mt-1 relative"
              >
                <div className="w-7 h-7 bg-rose-500/15 text-rose-400 rounded-lg flex items-center justify-center">
                  <Icons.Settings size={15} className="animate-spin duration-1000" />
                </div>
                <div className="flex flex-col items-start">
                  <span>داواکاری (Admin)</span>
                  <span className="text-[9px] text-zinc-500 font-normal">پەسەندکرنا پڕۆژەیان</span>
                </div>
                {pendingProjects.length > 0 && (
                  <span className="absolute left-3 top-4 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold animate-bounce">
                    {pendingProjects.length}
                  </span>
                )}
              </button>
            )}

            {/* User status */}
            <div className="border-t border-zinc-900 mt-1 pt-2 pb-1 px-3 text-[10px] text-zinc-500 flex flex-col gap-1 items-start text-left font-mono">
              {user ? (
                <>
                  <span className="text-zinc-400 font-bold truncate max-w-full">👤 {user.displayName || 'کۆدکار'}</span>
                  <span className="truncate max-w-full text-[9px]">{user.email}</span>
                </>
              ) : (
                <span className="text-zinc-500 font-semibold italic">👤 مێوان (میھمان)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Custom Projects & Auth Modal */}
      {showProjectsModal && (
        <div className="fixed inset-0 bg-black/95 z-[115] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-xl shadow-2xl relative text-right flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-4" dir="rtl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {projectsTab === 'my' && <Icons.File className="text-blue-400" />}
                {projectsTab === 'public' && <Icons.Globe className="text-emerald-400" />}
                {projectsTab === 'pending' && <Icons.Settings className="text-indigo-400" />}
                <span>
                  {projectsTab === 'my' && "پڕۆژێن من یێن سحابێ"}
                  {projectsTab === 'public' && "پڕۆژێن گشتی و نموونەیی"}
                  {projectsTab === 'pending' && "پەسەندکردنا پڕۆژان (Admin Panel)"}
                </span>
              </h3>
              <button 
                onClick={() => setShowProjectsModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-all"
              >
                <Icons.X size={18} />
              </button>
            </div>

            {/* Tab Swapping inside the modal */}
            <div className="flex gap-1.5 p-1 bg-zinc-900/60 rounded-xl mb-4 border border-zinc-800/40" dir="rtl">
              <button
                onClick={() => setProjectsTab('my')}
                className={`flex-1 py-2 rounded-lg font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 ${projectsTab === 'my' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              >
                <Icons.File size={12} />
                <span>پڕۆژێن من</span>
              </button>
              <button
                onClick={() => setProjectsTab('public')}
                className={`flex-1 py-2 rounded-lg font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 ${projectsTab === 'public' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
              >
                <Icons.Globe size={12} />
                <span>پڕۆژێن گشتی</span>
              </button>
              {user && user.email === 'hussein.zebary.chemistry96@gmail.com' && (
                <button
                  onClick={() => setProjectsTab('pending')}
                  className={`flex-1 py-2 rounded-lg font-extrabold text-[11px] transition-all flex items-center justify-center gap-1 relative ${projectsTab === 'pending' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
                >
                  <Icons.Settings size={12} />
                  <span>ڕێپێدانێن گشتی</span>
                  {pendingProjects.length > 0 && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">
                      {pendingProjects.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Modal Main Content Container */}
            <div className="flex-1 overflow-y-auto pr-1" dir="rtl">
              {/* TAB 1: MY PROJECTS */}
              {projectsTab === 'my' && (
                <div className="space-y-4">
                  {!user ? (
                    /* Auth Section */
                    <div className="space-y-4 py-2">
                      <div className="text-center space-y-2 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/60">
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          بۆ پاشەکەوتکرنا کارێن خۆ و پاراستنا وان ل سەر هەر ئامیرەکێ، بچۆ د ئەکاونتێ خۆ دا ب هەر شێوازەکێ دڤێت:
                        </p>
                      </div>

                      {/* Deployment / Host Warning for Firebase Authorized Domains */}
                      <div className="p-4 bg-amber-950/40 border border-amber-800/50 rounded-xl text-right space-y-3" dir="rtl">
                        <p className="text-xs font-black text-amber-400 flex items-center gap-1.5 justify-start">
                          <span>⚠️ ڕێبەرێ ڕێکخستنا فایەربەیس (ڕێگەپێدان ل سەر Netlify / GitHub)</span>
                        </p>
                        <div className="space-y-2 text-[11px] text-amber-200/90 leading-relaxed">
                          <p className="font-extrabold text-amber-300">١. کاراکرنا شێوازێن چوونەژوورێ (Sign-in Method):</p>
                          <p className="mr-2">
                            بۆ چارەسەرکرنا خەتایا <code className="bg-amber-950 px-1 py-0.5 rounded font-mono text-[10px] text-red-400">auth/operation-not-allowed</code>، پێویستە بچیە کۆنسۆلا Firebase بەشی <span className="font-bold underline">Authentication</span> پاشان لاپەڕا <span className="font-bold underline">Sign-in method</span> و هەردوو شێوازێن <strong>Email/Password</strong> و <strong>Google</strong> بکەیە چالاک (Enable) و Save بکەی.
                          </p>
                          <div className="h-[1px] bg-amber-800/30 my-1"></div>
                          <p className="font-extrabold text-amber-300">٢. زێدەکرنا دۆمەینێ مالپەڕی (Authorized Domains):</p>
                          <p className="mr-2">
                            بۆ ئەوی ڕێگە ب چوونەژوورێ بهێتە دان ل سەر نەتلیفای، پێویستە ناونیشانی مالپەڕی خۆت (بۆ نموونە <code className="bg-amber-950 px-1 py-0.5 rounded font-mono text-[10px] text-white">pdfhusseinn.netlify.app</code>) زیاد بکەیت لە لیستی <span className="font-bold">Authorized Domains</span> ل بەشی <span className="font-bold">Authentication &gt; Settings</span> ل ناو کۆنسۆلا Firebase Console.
                          </p>
                        </div>
                      </div>

                      {/* Google Sign In */}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await signInWithGoogle();
                          } catch (err: any) {
                            showAuthErrorAlert(err, "چوونەژوورەوە ب ڕێیا گوگل");
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-zinc-200 text-black font-bold text-xs rounded-xl transition-all shadow-xl"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                        </svg>
                        <span>چوونەژوورەوە ب ئەکاونتێ گوگلێ (Google Login)</span>
                      </button>

                      <div className="flex items-center gap-3 my-2 text-zinc-600 text-xs justify-center">
                        <div className="h-[1px] bg-zinc-800 flex-1"></div>
                        <span>یان ب ڕێیا ئیمەیڵێ</span>
                        <div className="h-[1px] bg-zinc-800 flex-1"></div>
                      </div>

                      {/* Custom Email Auth Form */}
                      <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-3">
                        {authIsSignUp && (
                          <div className="space-y-1">
                            <label className="text-[10px] text-zinc-400 font-bold block text-right">ناڤێ خۆ (Display Name)</label>
                            <input
                              type="text"
                              value={authDisplayName}
                              onChange={(e) => setAuthDisplayName(e.target.value)}
                              placeholder="ناڤێ تە ل سەر پڕۆژێن بەڵاڤکراو..."
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 text-right"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold block text-right">ئیمەیڵ (Email)</label>
                          <input
                            type="email"
                            value={authEmail}
                            onChange={(e) => setAuthEmail(e.target.value)}
                            placeholder="example@kpdf.com"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-zinc-400 font-bold block text-right">پەیڤا نهێنی (Password)</label>
                          <input
                            type="password"
                            value={authPassword}
                            onChange={(e) => setAuthPassword(e.target.value)}
                            placeholder="••••••"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 text-left"
                            dir="ltr"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            if (!authEmail || !authPassword) {
                              alert("تکایە هەمی جەها تژی بکە!");
                              return;
                            }
                            try {
                              setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: 'تێپەڕبوونا کاربەر...' }));
                              if (authIsSignUp) {
                                await registerWithEmail(authEmail, authPassword, authDisplayName || 'کۆدکارێ نوو');
                                alert("ئەکاونت ب سەرکەوتوویی هاتە تۆمارکرن! 🎉");
                              } else {
                                await loginWithEmail(authEmail, authPassword);
                                alert("بخێر بێی پڕۆژێن تە باربوون! 🎉");
                              }
                            } catch (err: any) {
                              showAuthErrorAlert(err, authIsSignUp ? "تۆمارکرنا ئەکاونتی" : "چوونەژوورەوە ب ئیمەیڵ");
                            } finally {
                              setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
                            }
                          }}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shadow-md transition-all mt-1"
                        >
                          {authIsSignUp ? "چێکرنا ئەکاونتی (Register)" : "چوونەژوورەوە (Login)"}
                        </button>

                        <div className="text-center mt-2">
                          <button
                            type="button"
                            onClick={() => setAuthIsSignUp(!authIsSignUp)}
                            className="text-xs text-blue-400 hover:underline"
                          >
                            {authIsSignUp ? "ئەکاونتی من هەیە؟ بچۆ ژوورەوە" : "ئەکاونتێ نوو نینە؟ لێرە تۆمار بکە"}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 my-2 text-zinc-600 text-xs justify-center">
                        <div className="h-[1px] bg-zinc-800 flex-1"></div>
                        <span>یان ب شێوازێ مێوان</span>
                        <div className="h-[1px] bg-zinc-800 flex-1"></div>
                      </div>

                      {/* Guest Sign In */}
                      <button
                        type="button"
                        onClick={async () => {
                          const name = prompt("تکایە ناڤێ خۆ بنڤیسە بۆ مێوانیکرنێ (یان ب سادەیی لێکبدە):", "مێوان / Guest");
                          if (name === null) return;
                          try {
                            setEditorState(prev => ({ ...prev, isProcessing: true, statusMessage: 'چوونەژوور وەک مێوان...' }));
                            await loginAsGuest(name || "مێوانێ بێناڤ");
                          } catch (err: any) {
                            showAuthErrorAlert(err, "چوونەژوور وەک مێوان");
                          } finally {
                            setEditorState(prev => ({ ...prev, isProcessing: false, statusMessage: null }));
                          }
                        }}
                        className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5"
                      >
                        <span className="text-yellow-500 font-extrabold text-sm">👤</span>
                        <span>چوونەژوورەوە وەک مێوان (Anonymous Login)</span>
                      </button>
                    </div>
                  ) : (
                    /* Authenticated Projects Dashboard */
                    <div className="space-y-4">
                      {/* User Badge */}
                      <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-xl border border-zinc-850">
                        <div className="flex items-center gap-3 text-right">
                          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-base border border-blue-500/20">
                            {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-white">{user.displayName || 'کۆدکارێ سحابێ'}</p>
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{user.email || 'guest@kpdf.local'}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm("ئەرێ تو دڵنیایی دەتەوێ بچییە دەر؟")) {
                              await logOut();
                            }
                          }}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-red-950/40 hover:text-red-400 hover:border-red-900/20 border border-zinc-700 text-zinc-400 font-bold text-[10px] rounded-lg transition-all"
                        >
                          دەرکەفتن (Logout)
                        </button>
                      </div>

                      {/* Save Current Work */}
                      <div className="p-4 bg-zinc-900/40 rounded-xl border border-zinc-850 space-y-2.5">
                        <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                          پاشەکەوتکرنا پڕۆژێ کار ل سەر دکەی (Save Current Work)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={saveTitle}
                            onChange={(e) => setSaveTitle(e.target.value)}
                            placeholder="ناڤ نیشانێ پڕۆژەی (ب نموونە: بیرکاری لاپەڕە ٥)..."
                            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 text-right"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!saveTitle.trim()) {
                                alert("تکایە سەرەتا ناڤەکێ بنڤیسە");
                                return;
                              }
                              handleSaveProjectToCloud();
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md"
                          >
                            <Icons.Save size={12} />
                            <span>پاشەکەوتکرن</span>
                          </button>
                        </div>
                      </div>

                      {/* User's Cloud Projects List */}
                      <div className="space-y-2">
                        <h4 className="text-[11px] text-zinc-400 font-extrabold uppercase tracking-wider block">
                          پڕۆژێن من یێن پاشەکەوتکری ({cloudProjects.length})
                        </h4>
                        
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                          {isCloudLoading ? (
                            <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
                              <Icons.Loader size={20} className="animate-spin text-blue-400" />
                              <span>...بارکرنا پڕۆژان</span>
                            </div>
                          ) : cloudProjects.length === 0 ? (
                            <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-xl bg-zinc-900/10">
                              چ پڕۆژە ل سەر سحابێ نینن. پڕۆژێ خۆ پاشەکەوت بکە بۆ ئەوی هەمی گاڤا بمینیت!
                            </div>
                          ) : (
                            cloudProjects.map((proj) => {
                              const updatedDate = proj.updatedAt?.seconds 
                                ? new Date(proj.updatedAt.seconds * 1000).toLocaleString('ku-IQ', { dateStyle: 'short', timeStyle: 'short' })
                                : new Date().toLocaleString('ku-IQ', { dateStyle: 'short', timeStyle: 'short' });
                              return (
                                <div
                                  key={proj.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-850 hover:border-zinc-800 rounded-xl transition-all gap-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 justify-start flex-row-reverse">
                                      <p className="text-xs font-extrabold text-white truncate text-right">
                                        {proj.title}
                                      </p>
                                      {proj.isPublished && (
                                        <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[9px] rounded font-bold">بەڵاڤکری گشتی</span>
                                      )}
                                      {proj.requestPublish && !proj.isPublished && (
                                        <span className="px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 text-[9px] rounded font-bold">چاوەڕێی ڕێپێدانێ</span>
                                      )}
                                    </div>
                                    <div className="flex gap-2 text-[10px] text-zinc-500 mt-1 flex-row-reverse justify-end">
                                      <span>{proj.pages?.length || 0} لاپەڕە</span>
                                      <span>•</span>
                                      <span>{updatedDate}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex gap-1.5 justify-end">
                                    {/* Request Public Publish button */}
                                    {!proj.isPublished && !proj.requestPublish && (
                                      <button
                                        type="button"
                                        onClick={() => handleRequestPublish(proj)}
                                        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-extrabold text-[10px] rounded-lg transition-all flex items-center gap-1 border border-zinc-700"
                                        title="داواکاری بکە بۆ بڵاوکردنەوەی گشتی"
                                      >
                                        <Icons.Globe size={11} className="text-zinc-400" />
                                        <span>بەڵاڤکرنا گشتی</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleLoadProjectFromCloud(proj);
                                        setShowProjectsModal(false);
                                      }}
                                      className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 font-extrabold text-[10px] rounded-lg transition-all flex items-center gap-1 border border-blue-500/20"
                                    >
                                      <Icons.Upload size={11} />
                                      <span>بارکرن</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProjectFromCloud(proj.id, proj.title)}
                                      className="p-1.5 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded-lg transition-all border border-red-500/10"
                                      title="سڕینەوە"
                                    >
                                      <Icons.Trash size={12} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PUBLIC PROJECTS */}
              {projectsTab === 'public' && (
                <div className="space-y-4">
                  <div className="text-center space-y-1 bg-zinc-900/40 p-3.5 rounded-xl border border-zinc-850 mb-2">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      ئەڤە ئەو پڕۆژە و شیتێن گشتینە کو ژ لایێ پڕۆژەکاران ڤە هاتینە بەڵاڤکرن و ژ لایێ ئەدمینی ڤە ڕێپێدان پێ هاتیە دان:
                    </p>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                    {isCloudLoading ? (
                      <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
                        <Icons.Loader size={20} className="animate-spin text-emerald-400" />
                        <span>...بارکرنا پڕۆژێن گشتی</span>
                      </div>
                    ) : cloudTemplates.length === 0 ? (
                      <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-xl bg-zinc-900/10">
                        هیچ پڕۆژەیەکی گشتی بڵاوکراوە بەردەست نییە نوکە.
                      </div>
                    ) : (
                      cloudTemplates.map((proj) => {
                        const updatedDate = proj.updatedAt?.seconds 
                          ? new Date(proj.updatedAt.seconds * 1000).toLocaleString('ku-IQ', { dateStyle: 'short' })
                          : new Date().toLocaleString('ku-IQ', { dateStyle: 'short' });
                        return (
                          <div
                            key={proj.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-zinc-900/20 hover:bg-zinc-900/40 border border-emerald-950 hover:border-emerald-900 rounded-xl transition-all gap-2"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-extrabold text-white truncate text-right">
                                {proj.title}
                              </p>
                              <div className="flex gap-2 text-[10px] text-zinc-500 mt-1.5 flex-row-reverse justify-end items-center flex-wrap">
                                <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-bold">بەلایەنێ: {proj.authorName || 'کۆدکار'}</span>
                                {proj.authorEmail && user && user.email === 'hussein.zebary.chemistry96@gmail.com' && (
                                  <span className="text-zinc-600 text-[9px] font-mono">{proj.authorEmail}</span>
                                )}
                                <span>•</span>
                                <span>{proj.pages?.length || 0} لاپەڕە</span>
                                <span>•</span>
                                <span>{updatedDate}</span>
                              </div>
                            </div>
                            
                            <div className="flex gap-1.5 justify-end shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  handleLoadProjectFromCloud(proj);
                                  setShowProjectsModal(false);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] rounded-lg transition-all flex items-center gap-1 shadow-lg shadow-emerald-500/10"
                              >
                                <Icons.Copy size={11} />
                                <span>کۆپی و بارکرن</span>
                              </button>

                              {/* Admin action: Unpublish */}
                              {user && user.email === 'hussein.zebary.chemistry96@gmail.com' && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePublish(proj)}
                                  className="p-1.5 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded-lg transition-all border border-red-500/10"
                                  title="لابردنی بەڵاڤکردنەوەی گشتی"
                                >
                                  <Icons.X size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PENDING APPROVALS (ADMIN ONLY) */}
              {projectsTab === 'pending' && user && user.email === 'hussein.zebary.chemistry96@gmail.com' && (
                <div className="space-y-4">
                  <div className="bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-900/40 mb-2">
                    <p className="text-xs text-indigo-300 leading-relaxed text-right">
                      بۆماڵپەڕێ ئەدمینێ بەڕێز حسین زێباری: ئەڤە ئەو پڕۆژەنە یێن بەکارهێنەران داواکاری ل سەر کرین بۆ بڵاوکردنەوەی گشتی. پەسەند بکە بۆ ئەوی هەمی کەس پێ ببینیتن:
                    </p>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
                    {isCloudLoading ? (
                      <div className="py-12 text-center text-xs text-zinc-400 flex flex-col items-center gap-2">
                        <Icons.Loader size={20} className="animate-spin text-indigo-400" />
                        <span>......بارکرنا داواکاریان</span>
                      </div>
                    ) : pendingProjects.length === 0 ? (
                      <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-850 rounded-xl bg-zinc-900/10">
                        چ داواکارییەکا بەڵاڤکرنێ د چاوەڕوانیێ دا نینە نوکە.
                      </div>
                    ) : (
                      pendingProjects.map((proj) => {
                        return (
                          <div
                            key={proj.id}
                            className="flex flex-col p-3.5 bg-zinc-900/40 border border-indigo-900/50 rounded-xl transition-all gap-3"
                          >
                            <div className="flex-1 text-right">
                              <h4 className="text-xs font-extrabold text-white">{proj.title}</h4>
                              <div className="flex flex-col gap-1 mt-2 text-[10px] text-zinc-400">
                                <div className="flex justify-end gap-1.5">
                                  <span className="text-zinc-200 font-bold">{proj.authorName || 'نەدیار'}</span>
                                  <span className="text-zinc-500">:ناڤێ کۆدکاری</span>
                                </div>
                                <div className="flex justify-end gap-1.5 font-mono">
                                  <span className="text-zinc-300">{proj.authorEmail || 'بێ ئیمەیڵ'}</span>
                                  <span className="text-zinc-500">:ئیمەیڵێ وی</span>
                                </div>
                                <div className="flex justify-end gap-1.5">
                                  <span className="text-zinc-300">{proj.pages?.length || 0} لاپەڕە</span>
                                  <span className="text-zinc-500">:ڕێژەیا لاپەڕان</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 justify-end border-t border-zinc-850 pt-2.5">
                              <button
                                type="button"
                                onClick={() => handleApprovePublish(proj, true)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[11px] rounded-lg transition-all flex items-center gap-1 shadow-md shadow-indigo-600/10"
                              >
                                <Icons.Check size={12} />
                                <span>پەسەندکرن (Approve)</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleApprovePublish(proj, false)}
                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-extrabold text-[11px] rounded-lg transition-all flex items-center gap-1 border border-zinc-700"
                              >
                                <Icons.X size={12} />
                                <span>ڕەتکرن (Reject)</span>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center mt-5 border-t border-zinc-800 pt-4" dir="rtl">
              <span className="text-[10px] text-zinc-500 font-mono">KPDF Cloud Sync Panel</span>
              <button 
                onClick={() => setShowProjectsModal(false)} 
                className="px-4 py-1.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded-lg transition-colors"
              >
                پاشەکەوت و داخستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Google Drive Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 bg-black/95 z-[115] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-2xl shadow-2xl relative text-right flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4 mb-4" dir="rtl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icons.Drive className="text-amber-500" />
                <span>گووگڵ درایڤ / Google Drive</span>
              </h3>
              <button 
                onClick={() => setShowDriveModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-lg transition-all"
              >
                <Icons.X size={18} />
              </button>
            </div>

            {/* If Google Drive is not connected yet */}
            {!getGoogleAccessToken() ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" dir="rtl">
                <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-4">
                  <Icons.Drive size={32} />
                </div>
                <h4 className="text-md font-bold text-white mb-2">بەستنەوە بە گووگڵ درایڤ</h4>
                <p className="text-xs text-zinc-400 max-w-sm mb-6 leading-relaxed">
                  بۆ بارکردن، دەستکاریکردن یان پاشەکەوتکردنی فایلەکانت ڕاستەوخۆ لە گووگڵ درایڤ، پێویستە سەرەتا مۆڵەت بەم ئەپە بدەیت.
                </p>
                
                {driveError && (
                  <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 p-3 rounded-lg mb-4 max-w-md" dir="rtl">
                    {driveError}
                  </div>
                )}

                <button
                  onClick={handleConnectDrive}
                  disabled={isDriveLoading}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-900/30 transition-all flex items-center gap-2"
                >
                  {isDriveLoading ? (
                    <>
                      <Icons.Loader size={16} className="animate-spin" />
                      <span>داواکردنی مۆڵەت...</span>
                    </>
                  ) : (
                    <>
                      <Icons.Drive size={16} />
                      <span>ڕێگەدان و پەیوەستکردن</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 overflow-hidden" dir="rtl">
                {/* Save Current File Panel */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col gap-3">
                  <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <Icons.Save size={14} className="text-indigo-400" />
                    پاشەکەوتکردنی فایل لەسەر درایڤ (Save / Export to Drive)
                  </span>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="ناوی فایل بۆ پاشەکەوتکردن بنووسە..."
                      value={saveDriveFilename}
                      onChange={(e) => setSaveDriveFilename(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                    
                    <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                      <button
                        onClick={() => setSaveDriveType('pdf')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${saveDriveType === 'pdf' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                      >
                        PDF
                      </button>
                      <button
                        onClick={() => setSaveDriveType('kpdf')}
                        className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${saveDriveType === 'kpdf' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                      >
                        KPDF (پڕۆژە)
                      </button>
                    </div>

                    <button
                      onClick={() => handleSaveToDrive(saveDriveFilename || saveTitle || "بێ_ناو", saveDriveType)}
                      disabled={isSavingToDrive || pages.length === 0}
                      className="px-4 py-1.5 bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-extrabold text-[11px] rounded-lg transition-all flex items-center gap-1.5 justify-center"
                    >
                      {isSavingToDrive ? (
                        <>
                          <Icons.Loader size={12} className="animate-spin" />
                          <span>خەریکە دەنێردرێت...</span>
                        </>
                      ) : (
                        <>
                          <Icons.Save size={12} />
                          <span>پاشەکەوتکردن</span>
                        </>
                      )}
                    </button>
                  </div>
                  {pages.length === 0 && (
                    <span className="text-[10px] text-zinc-500">هیچ لاپەڕەیەک نییە بۆ پاشەکەوتکردن. سەرەتا فایلێک بکەرەوە.</span>
                  )}
                </div>

                {/* Search & List Header */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-zinc-800/60 pt-3">
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="گەڕان بەدوای فایلەکاندا..."
                      value={driveSearch}
                      onChange={(e) => setDriveSearch(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={() => handleLoadDriveFiles(getGoogleAccessToken()!, driveSearch)}
                      className="absolute right-2 top-1.5 text-zinc-400 hover:text-white"
                    >
                      <Icons.Globe size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="text-[10px] text-zinc-400">
                      پەیوەستکراوە بە: <strong className="text-zinc-200">{auth.currentUser?.email || auth.currentUser?.displayName}</strong>
                    </span>
                    <button
                      onClick={() => handleLoadDriveFiles(getGoogleAccessToken()!, driveSearch)}
                      disabled={isDriveLoading}
                      className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg transition-colors"
                      title="تازەکردنەوەی لیستی فایلەکان"
                    >
                      <Icons.Loader size={12} className={isDriveLoading ? "animate-spin" : ""} />
                    </button>
                  </div>
                </div>

                {/* Drive Files List */}
                <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950 max-h-[40vh] min-h-[200px]">
                  {isDriveLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-400 text-xs">
                      <Icons.Loader size={24} className="animate-spin text-amber-500 mb-2" />
                      داگرتنی فایلەکانی گووگڵ درایڤ...
                    </div>
                  ) : driveError ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-red-400 text-xs px-4">
                      {driveError}
                      <button
                        onClick={() => handleLoadDriveFiles(getGoogleAccessToken()!, driveSearch)}
                        className="mt-3 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded-lg"
                      >
                        دووبارە هەوڵبدەرەوە
                      </button>
                    </div>
                  ) : driveFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-xs">
                      هیچ فایلێکی گونجاو (PDF یان KPDF) نەدۆزرایەوە لە درایڤەکەتدا.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-900">
                      {driveFiles.map((file) => {
                        const isKpdf = file.name.endsWith('.kpdf') || file.name.endsWith('.json') || file.mimeType === 'application/json';
                        return (
                          <div key={file.id} className="p-3 hover:bg-zinc-900/40 flex items-center justify-between transition-all">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isKpdf ? 'bg-indigo-500/10 text-indigo-400' : 'bg-red-500/10 text-red-400'}`}>
                                {isKpdf ? <Icons.Save size={16} /> : <Icons.File size={16} />}
                              </div>
                              <div className="text-right">
                                <h4 className="text-xs font-bold text-white leading-tight">{file.name}</h4>
                                <span className="text-[9px] text-zinc-500 font-mono">
                                  {file.size ? `${(Number(file.size) / 1024 / 1024).toFixed(2)} MB` : 'نەزانراو'} • {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''}
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleOpenDriveFile(file)}
                              className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-white font-bold text-[10px] rounded-md transition-all"
                            >
                              کردنەوە (Open)
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mt-2 text-[10px] text-zinc-500">
                  <span>دەتوانیت گەڕان بکەیت بەدوای فایلی کەیفی</span>
                  <button 
                    onClick={() => {
                      setGoogleAccessToken(null);
                      setDriveFiles([]);
                    }}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    پچڕاندنی پەیوەندی (Disconnect)
                  </button>
                </div>

              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-between items-center mt-5 border-t border-zinc-800 pt-4" dir="rtl">
              <span className="text-[10px] text-zinc-500 font-mono">Google Workspace Integration</span>
              <button 
                onClick={() => setShowDriveModal(false)} 
                className="px-4 py-1.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded-lg transition-colors"
              >
                داخستن
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Floating Toolbar */}
      <Toolbar 
        editorState={editorState}
        onToolChange={handleToolChange}
        onColorChange={(c) => setEditorState(prev => ({ ...prev, strokeColor: c }))}
        onWidthChange={(w) => setEditorState(prev => ({ ...prev, strokeWidth: w }))}
        onUpload={handleFileUpload}
        onImageUpload={handleImageUpload}
        onExport={handleExport}
        onExportFullQuality={handleExportFullQuality}
        onSaveProject={handleSaveProject}
        onAddPage={handleAddPage}
        canUndo={getPageHistory(activePage).undoStack.length > 1} 
        canRedo={getPageHistory(activePage).redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSettings={() => setShowApiModal(true)}
        onToggleRecording={handleToggleRecording}
        onRunOCR={handleRunOCRClick}
        isRecording={isRecording}
        voiceLanguage={voiceLanguage}
        onVoiceLanguageChange={setVoiceLanguage}
        iconSize={iconSize}
        onAddElement={handleAddElementToCanvas}
        onAddMathSymbol={handleAddMathSymbolToCanvas}
        onAIParseMath={handleAIParseMath}
        onTroubleshootPage={handleTroubleshootPage}
        onOpenDrive={() => {
          setShowDriveModal(true);
          const token = getGoogleAccessToken();
          if (token) {
            handleLoadDriveFiles(token);
          }
        }}
      />

      <div className="relative flex flex-1 overflow-hidden flex-col md:flex-row pt-24 md:pt-0">
        {/* Sidebar for Thumbnails */}
        {pages.length > 0 && (
          <Sidebar 
            pages={pages} 
            activePage={activePage} 
            onPageSelect={scrollToPage}
            onDeletePage={handleDeletePage}
          />
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 overflow-y-auto bg-neutral-900 p-4 md:p-8 flex flex-col items-center pb-32 md:pb-8">
            {pages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 mt-10 md:mt-0">
                    <div className="bg-surface p-8 rounded-2xl border border-gray-700 text-center shadow-2xl max-w-md mx-4">
                        <p className="text-2xl mb-4 font-bold text-gray-200">بەخێربێی بۆ دەستکاریکەری PDF</p>
                        <p className="mb-6 text-gray-400">تکایە فایلەکا PDF یان پڕۆژەیەکێ کۆدکراو (.kpdf) باربکە بۆ دەستپێکرن یان لاپەرەکێ سپی زێدەکەن</p>
                         <div className="flex flex-col sm:flex-row gap-4 justify-center">
                             <label className="px-6 py-3 bg-primary hover:bg-blue-600 text-white rounded-lg cursor-pointer transition-colors inline-block font-bold shadow-lg shadow-blue-500/30">
                                   بارکرنا PDF یان پڕۆژەی (.kpdf)
                                   <input type="file" accept=".pdf,.json,.kpdf" className="hidden" onChange={handleFileUpload} />
                             </label>
                             <button 
                                onClick={handleAddPage}
                                className="px-6 py-3 bg-surface hover:bg-gray-600 border border-gray-500 text-white rounded-lg transition-colors font-bold"
                             >
                                لاپەرێ سپی
                             </button>
                         </div>
                     </div>
                </div>
            ) : (
                pages.map(page => (
                    <PageEditor
                        key={page.pageNumber}
                        pageNumber={page.pageNumber}
                        bgImage={page.image}
                        viewport={page.viewport}
                        editorState={editorState}
                        isActive={activePage === page.pageNumber}
                        onCanvasReady={handleCanvasReady}
                        onModified={() => saveCanvasState(page.pageNumber)}
                        isRecording={isRecording}
                        onToggleRecording={handleToggleRecording}
                        apiKey={apiKey}
                        onOpenSettings={() => setShowApiModal(true)}
                        onOpenFormatter={() => setShowFormatterSidebar(prev => !prev)}
                        showFormatterSidebar={showFormatterSidebar}
                        onTextSelection={(canvas, obj) => {
                          if (obj) {
                            setActiveTextSelection({ canvas, object: obj });
                            setEditorState(prev => ({ ...prev, activeTool: 'select' }));
                          } else {
                            setActiveTextSelection(null);
                          }
                        }}
                    />
                ))
            )}
        </div>

        {/* Sidebar for Text & Object Formatting (Right Side) */}
        {pages.length > 0 && activeTextSelection && showFormatterSidebar && (
          <div className="w-full md:w-[240px] border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-950 flex flex-col shrink-0 md:z-30 max-md:fixed max-md:top-[125px] max-md:left-4 max-md:right-4 max-md:mx-auto max-md:w-auto max-md:max-w-md max-md:z-50 max-md:rounded-xl max-md:border max-md:shadow-2xl max-md:max-h-[38vh] max-md:overflow-hidden">
            <TextFormatter 
              canvas={activeTextSelection.canvas}
              activeObject={activeTextSelection.object}
              onModified={() => saveCanvasState(activePage)}
              onClose={() => {
                if (activeTextSelection.canvas) {
                  try {
                    activeTextSelection.canvas.discardActiveObject();
                    activeTextSelection.canvas.renderAll();
                  } catch (e) {
                    console.error(e);
                  }
                }
                setActiveTextSelection(null);
                setShowFormatterSidebar(false);
              }}
            />
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-black/90 border-t border-gray-800 p-1 px-4 text-xs text-gray-600 flex justify-between z-40 relative">
         <span>Kurdish PDF Editor v2.2 (AI Powered)</span>
         <span>{pages.length} Pages</span>
      </div>
    </div>
  );
};

export default App;