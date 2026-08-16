import React, { useState, useEffect, useRef } from 'react';
import { User, RealEstateProject, Sale, CommissionPayout, Notification, MLMConfig, UserRole, UserLog } from './types';
import { 
  INITIAL_MLM_CONFIG, 
  INITIAL_PROJECTS, 
  INITIAL_USERS, 
  INITIAL_SALES, 
  INITIAL_PAYOUTS, 
  INITIAL_NOTIFICATIONS 
} from './data/seedData';
import {
  Building2,
  Users,
  TrendingUp,
  IndianRupee,
  Briefcase,
  ShieldCheck,
  Award,
  BookOpen,
  Lock,
  HelpCircle,
  LogOut,
  RefreshCw,
  Home,
  Menu,
  Moon,
  Sun,
  Wallet,
  X,
  IdCard,
  UserCog,
  Layers,
  Share2,
  FileSpreadsheet
} from 'lucide-react';

/**
 * Primary navigation. Entries either scroll to an `anchor` (a DOM id the panels
 * render — they switch sub-tabs via navFocus) or navigate to a hash `route`.
 *
 * Routing is hash-based (`#/profile`) on purpose: the production build is a
 * static GitHub Pages SPA with `base: './'`, so history-based paths would 404
 * on refresh. Anchored entries keep the dashboard a single scrollable page;
 * `route` entries swap the whole main view.
 */
const NAV_ITEMS = [
  { key: 'HOME', label: 'Home', icon: Home, anchor: 'sbr-top' },
  { key: 'PROFILE', label: 'Profile', icon: IdCard, route: '/profile' },
  { key: 'TEAM', label: 'Team', icon: Users, anchor: 'sbr-team-section' },
  { key: 'INVENTORY', label: 'Plot Inventory', icon: Layers, anchor: 'sbr-inventory-section' },
  // Payouts is a dedicated page (PayoutsDesk) rather than a dashboard scroll —
  // same reasoning as /profile: the dashboard is too long on mobile.
  { key: 'PAYOUTS', label: 'Payouts', icon: Wallet, route: '/payouts' },
  // Sales as a dense data table — the dashboard card view hides fields on mobile.
  { key: 'SALES_REPORT', label: 'Sales Report', icon: FileSpreadsheet, route: '/sales-report' },
  { key: 'SPONSOR_CODE', label: 'Sponsor Reference Code', icon: Share2, anchor: 'sbr-sponsor-code' },
  { key: 'EDIT_DETAIL', label: 'Edit Detail', icon: UserCog, route: '/profile', anchor: 'profile-edit-section' },
];

/** `#/profile/SBR0004` → `/profile/SBR0004`; empty or bare `#` → `/`. */
function parseHashRoute(): string {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
}
import TreeVisualizer from './components/TreeVisualizer';
import AdminPanel from './components/AdminPanel';
import AgentPanel from './components/AgentPanel';
import LoginScreen from './components/LoginScreen';
import ProfilePage from './components/ProfilePage';
import PayoutsDesk from './components/PayoutsDesk';
import SalesReport from './components/SalesReport';
import { normalizeUsers, normalizeUsersWithSales, rebuildPayoutsFromSales } from './lib/designation';
import { 
  seedDatabase, 
  setDocumentData, 
  deleteDocument, 
  COLLECTIONS,
  ensureAuthenticated,
  getCollectionData
} from './lib/firebase';
import { hashPassword, hashPasswordIfNeeded, isSha256 } from './lib/crypto';

export const SECURE_PASSWORD_HASHES: Record<string, string> = {
  'C': '47ea7c8c4e02fc37b54fd9c210ee80431b8284c77863e723d8733fffe95725c7',
  'A1': 'f5642579535c413747e3f3346b45adcf04a778ad81bc6cb806633ca0e2f80199',
  'A2': '31c1a2adb1bcf2effcbe9ff7b997fd4a523b05293328326164c3cb0dab27e2ea',
  'RAM': 'e0a19949ca7fab3c3082a69a1fcfa2d8d5b3196d785faf2f7855c706e763f4c6',
  'MANORANJAN': '2143268ce53ceea40b9c702c4beb3924be1b24d50a8bf23ec267070dee182762',
  'DK': '759f361ef6c08928beed29bb2eda100917bffeb52ff2aa082f0291d3b2d9da60',
  'VIKAS': '8d1cdaf06bbee7926c3e6399a59702d5d6afe6f4e96f0ea8b971340d34aeb817'
};

// Strict password upgrade mechanism for the 7 secure nodes in memory.
export function getUpgradedPassword(userId: string, currentPasswordValue: string): string {
  const upperId = userId.toUpperCase();
  const targetNewHash = SECURE_PASSWORD_HASHES[upperId];
  if (!targetNewHash) return currentPasswordValue;

  // STRICT ZERO-TRUST SECURITY ENFORCEMENT FOR THE 7 SBR SECURE NODES:
  // For these 7 nodes, older passwords (like 'C@SBR', 'Ram@SBR', 'Vikas@SBR', 'Dk@SBR', 'Manoranjan@SBR', 'SBR@2026', 'password') must not work under any circumstances.
  // We force their expected password hash in memory to always be their new secure hash.
  // This invalidates and overrides any legacy plaintext or old hashes in the database.
  return targetNewHash;
}

export default function App() {
  const [activeRole, setActiveRole] = useState<UserRole>('ADMIN');
  const [activeAgentId, setActiveAgentId] = useState<string>('C'); // Simulated default agent (Company Profile C)
  const [session, setSession] = useState<{ role: UserRole; agentId?: string; name: string; passwordHash?: string } | null>(null);
  
  // Master states
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<RealEstateProject[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayout[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [config, setConfig] = useState<MLMConfig>(INITIAL_MLM_CONFIG);
  const [dbLoading, setDbLoading] = useState(true);
  const [userLogs, setUserLogs] = useState<UserLog[]>([]);
  const isSyncingRef = useRef(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  // Selected User in the Tree diagram
  const [selectedTreeUserId, setSelectedTreeUserId] = useState<string | null>('C');

  // Header shell: light/dark preference + primary navigation
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('SBR_THEME');
    return stored === 'dark' ? 'dark' : 'light';
  });
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [activeNav, setActiveNav] = useState('HOME');

  // Hash route (`#/profile`, `#/profile/<id>`). Kept in state so back/forward
  // buttons re-render; the hash itself is the source of truth.
  const [route, setRoute] = useState<string>(parseHashRoute);

  useEffect(() => {
    const onHashChange = () => {
      const next = parseHashRoute();
      setRoute(next);
      setActiveNav(
        next.startsWith('/profile') ? 'PROFILE'
        : next.startsWith('/payouts') ? 'PAYOUTS'
        : next.startsWith('/sales-report') ? 'SALES_REPORT'
        : 'HOME'
      );
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateTo = (path: string) => {
    if (path === '/') {
      // Clear the route without leaving a dangling '#/' in the URL bar.
      history.pushState(null, '', window.location.pathname + window.location.search);
      setRoute('/');
      setActiveNav('HOME');
    } else {
      window.location.hash = path; // fires hashchange → state sync above
    }
  };

  // The `.dark` class lives on <html> (not the layout root) so it also covers
  // <body> and the pre-login screen. All colour rules hang off it — see theme.css.
  useEffect(() => {
    localStorage.setItem('SBR_THEME', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Freeze the page behind the nav drawer so only the drawer scrolls.
  useEffect(() => {
    if (!isNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isNavOpen]);

  /**
   * Nav selection: highlight the entry, close the drawer, then scroll to its
   * anchor. The target may not exist yet (the panels switch sub-tab in response
   * to navFocus), so poll briefly instead of assuming it is already mounted.
   */
  const handleNavSelect = (key: string) => {
    setIsNavOpen(false);

    const target = NAV_ITEMS.find(item => item.key === key);
    if (!target) return;

    // Retry-scroll: the target may mount a tick later (route swap / sub-tab switch).
    const scrollToAnchor = (anchor: string) => {
      let attempts = 0;
      const tryScroll = () => {
        if (anchor === 'sbr-top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        const el = document.getElementById(anchor);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (attempts++ < 10) {
          setTimeout(tryScroll, 80);
        }
      };
      setTimeout(tryScroll, 60);
    };

    // Route entries swap the main view; an optional anchor then scrolls within
    // the new view (e.g. Edit Detail → /profile → bank-details section).
    if ('route' in target && target.route) {
      navigateTo(target.route);
      setActiveNav(key);
      if (target.anchor) scrollToAnchor(target.anchor);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Anchored entries live on the dashboard — leave /profile first if needed.
    // (navigateTo('/') resets activeNav, so set the highlight after it.)
    if (route !== '/') {
      navigateTo('/');
    }
    setActiveNav(key);
    scrollToAnchor(target.anchor!);
  };

  // Security Modal States
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const sanitizeProjects = (rawProjects: RealEstateProject[]): RealEstateProject[] => {
    const filtered = (rawProjects || []).filter(p => p.id !== 'PRJ-251');
    const nameMap = new Map<string, RealEstateProject>();

    for (const proj of filtered) {
      const normName = (proj.name || '').trim().toLowerCase();
      const existing = nameMap.get(normName);
      if (!existing) {
        nameMap.set(normName, proj);
      } else if (proj.id === 'PRJ-183') {
        nameMap.set(normName, proj);
      }
    }

    for (const initProj of INITIAL_PROJECTS) {
      const normName = initProj.name.trim().toLowerCase();
      if (!nameMap.has(normName)) {
        nameMap.set(normName, initProj);
      } else {
        const curr = nameMap.get(normName)!;
        if (initProj.id === 'PRJ-183') {
          let updatedInv = (curr.inventory && curr.inventory.length >= 10) ? curr.inventory : initProj.inventory;
          updatedInv = updatedInv.map(cat => ({
            ...cat,
            units: cat.units.map(u => {
              if (u.unitNumber === 'Plot 54' || u.unitNumber === '54') {
                return {
                  ...u,
                  status: 'BOOKED' as const,
                  bookedByAgentId: 'SBR0055',
                  buyerName: 'Anju Devi'
                };
              }
              return u;
            })
          }));
          nameMap.set(normName, {
            ...curr,
            id: 'PRJ-183',
            inventory: updatedInv
          });
        }
      }
    }

    return Array.from(nameMap.values());
  };

  const loadPrivateData = async (
    sessionParsed: { role: UserRole; agentId?: string; name: string; passwordHash?: string },
    preloadedData?: any,
    isBackground = false
  ) => {
    if (!isBackground) {
      setDbLoading(true);
    }
    try {
      await ensureAuthenticated();
      
      const data = preloadedData || await seedDatabase({
        users: INITIAL_USERS,
        projects: INITIAL_PROJECTS,
        sales: INITIAL_SALES,
        payouts: INITIAL_PAYOUTS,
        config: INITIAL_MLM_CONFIG,
        notifications: INITIAL_NOTIFICATIONS
      });

      const activeConfig = data.config || INITIAL_MLM_CONFIG;
      setConfig(activeConfig);
      
      const rawSales = data.sales || INITIAL_SALES;
      let loadedSales = rawSales.map((s: any) => ({
        ...s,
        projectId: s.projectId === 'PRJ-251' ? 'PRJ-183' : s.projectId
      }));
      for (const initSale of INITIAL_SALES) {
        if (!loadedSales.some((s: any) => s.id === initSale.id)) {
          loadedSales = [initSale, ...loadedSales];
          setDocumentData(COLLECTIONS.SALES, initSale.id, initSale).catch(() => {});
        }
      }

      const loadedProjects = sanitizeProjects(data.projects || INITIAL_PROJECTS);
      deleteDocument(COLLECTIONS.PROJECTS, 'PRJ-251').catch(() => {});
      const indriProj = loadedProjects.find(p => p.id === 'PRJ-183' || p.name === 'Indri KMP');
      if (indriProj) {
        setDocumentData(COLLECTIONS.PROJECTS, indriProj.id, indriProj).catch(() => {});
      }
      setProjects(loadedProjects);

      let loadedUsers = normalizeUsersWithSales(data.users || INITIAL_USERS, loadedSales, activeConfig);
      for (const initUser of INITIAL_USERS) {
        if (!loadedUsers.some((u: any) => u.id === initUser.id)) {
          loadedUsers = [...loadedUsers, initUser];
          setDocumentData(COLLECTIONS.USERS, initUser.id, initUser).catch(() => {});
        }
      }

      // Force upgrade old vulnerable passwords to their correct secure hashes for the 7 secure nodes
      loadedUsers = loadedUsers.map(user => ({
        ...user,
        password: getUpgradedPassword(user.id, user.password)
      }));

      // --- ZERO-TRUST SESSION INVALIDATION SECURITY GATES ---
      if (sessionParsed.agentId) {
        const upperAgentId = sessionParsed.agentId.toUpperCase();
        const liveUser = loadedUsers.find(u => u.id.toUpperCase() === upperAgentId);
        if (!liveUser) {
          console.log(`[Session Invalidation] Active session for ${sessionParsed.agentId} has been invalidated (User does not exist).`);
          handleLogout();
          if (!isBackground) setDbLoading(false);
          return;
        }

        if (liveUser.status !== 'ACTIVE') {
          console.log(`[Session Invalidation] Active session for ${sessionParsed.agentId} has been invalidated (Account INACTIVE).`);
          handleLogout();
          if (!isBackground) setDbLoading(false);
          return;
        }

        // Verify password hash matches perfectly
        const sessionPasswordHash = sessionParsed.passwordHash || '';
        const livePasswordHash = liveUser.password || 'DEFAULT';
        if (sessionPasswordHash !== livePasswordHash) {
          console.log(`[Session Invalidation] Active session for ${sessionParsed.agentId} has been invalidated (Password changed/mismatched).`);
          handleLogout();
          if (!isBackground) setDbLoading(false);
          return;
        }

        // Verify session role matches the user's designated role
        const isCoreAdmin = ['C', 'A1', 'A2', 'RAM', 'MANORANJAN', 'VIKAS', 'DK'].includes(upperAgentId);
        const expectedRole = (liveUser.role === 'ADMIN' && isCoreAdmin) ? 'ADMIN' : 'AGENT';
        if (sessionParsed.role !== expectedRole) {
          console.log(`[Session Invalidation] Active session for ${sessionParsed.agentId} has been invalidated (Role mismatch).`);
          handleLogout();
          if (!isBackground) setDbLoading(false);
          return;
        }
      } else {
        console.log(`[Session Invalidation] Invalid session structure.`);
        handleLogout();
        if (!isBackground) setDbLoading(false);
        return;
      }

      // --- SELF-HEALING LOCAL-TO-CLOUD SYNC ---
      const storedUsersStr = localStorage.getItem('SBR_USERS');
      if (storedUsersStr) {
        try {
          const storedUsers = JSON.parse(storedUsersStr);
          if (Array.isArray(storedUsers)) {
            const missingUsersInFirestore = storedUsers.filter(
              localU => localU && localU.id && !loadedUsers.some(cloudU => cloudU.id === localU.id)
            );
            if (missingUsersInFirestore.length > 0) {
              await Promise.all(missingUsersInFirestore.map(async (localUser) => {
                await setDocumentData(COLLECTIONS.USERS, localUser.id, localUser);
                loadedUsers.push(localUser);
              }));
              loadedUsers = normalizeUsersWithSales(loadedUsers, loadedSales, activeConfig);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      // Sync sales and notifications
      const storedSalesStr = localStorage.getItem('SBR_SALES');
      if (storedSalesStr) {
        try {
          const storedSales = JSON.parse(storedSalesStr);
          if (Array.isArray(storedSales)) {
            const missingSalesInFirestore = storedSales.filter(
              localS => localS && localS.id && !loadedSales.some(cloudS => cloudS.id === localS.id)
            );
            if (missingSalesInFirestore.length > 0) {
              await Promise.all(missingSalesInFirestore.map(async (localSale) => {
                await setDocumentData(COLLECTIONS.SALES, localSale.id, localSale);
                loadedSales.push(localSale);
              }));
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      const storedNotifsStr = localStorage.getItem('SBR_NOTIFICATIONS');
      if (storedNotifsStr) {
        try {
          const storedNotifs = JSON.parse(storedNotifsStr);
          if (Array.isArray(storedNotifs)) {
            const currentCloudNotifs = data.notifications || INITIAL_NOTIFICATIONS;
            const missingNotifsInFirestore = storedNotifs.filter(
              localN => localN && localN.id && !currentCloudNotifs.some(cloudN => cloudN.id === localN.id)
            );
            if (missingNotifsInFirestore.length > 0) {
              await Promise.all(missingNotifsInFirestore.map(async (localNotif) => {
                await setDocumentData(COLLECTIONS.NOTIFICATIONS, localNotif.id, localNotif);
              }));
            }
          }
        } catch (err) {
          console.error(err);
        }
      }

      const loadedNotifs = (data.notifications || INITIAL_NOTIFICATIONS).filter(n => {
        return loadedUsers.some(u => u.id === n.userId);
      });

      // --- Auto Deletion / Reparenting of Deleted SBR Users ---
      const deletionsToApply = [
        { id: 'SBR0016', targetSponsor: 'SBR0009' },
        { id: 'SBR0021', targetSponsor: 'SBR0009' },
        { id: 'SBR0011', targetSponsor: 'SBR0009' },
        { id: 'SBR0007', targetSponsor: 'SBR0006' },
        { id: 'SBR0015', targetSponsor: 'SBR0006' },
        { id: 'SBR0036', targetSponsor: 'C' }
      ];

      let needsNormalization = false;
      for (const del of deletionsToApply) {
        const delUserIndex = loadedUsers.findIndex(u => u.id === del.id);
        const hasDelUser = delUserIndex !== -1;
        const hasChildrenOfDel = loadedUsers.some(u => u.sponsorId === del.id);

        if (hasDelUser || hasChildrenOfDel) {
          const resolvedSponsor = hasDelUser ? (loadedUsers[delUserIndex].sponsorId || del.targetSponsor) : del.targetSponsor;

          loadedUsers = loadedUsers.map(u => {
            if (u.sponsorId === del.id) {
              const updated = { ...u, sponsorId: resolvedSponsor };
              setDocumentData(COLLECTIONS.USERS, u.id, updated).catch(e => 
                console.error(`[Auto-Deletion] Failed to update sponsor for ${u.id}:`, e)
              );
              needsNormalization = true;
              return updated;
            }
            return u;
          });

          if (hasDelUser) {
            loadedUsers = loadedUsers.filter(u => u.id !== del.id);
            deleteDocument(COLLECTIONS.USERS, del.id).catch(err => {
              console.error(`[Auto-Deletion] Failed to delete ${del.id} document:`, err);
            });
            needsNormalization = true;
          }
        }
      }

      if (needsNormalization) {
        loadedUsers = normalizeUsersWithSales(loadedUsers, loadedSales, activeConfig);
      }

      const rawPayouts = data.payouts || INITIAL_PAYOUTS;
      const sanitizedExistingPayouts = rawPayouts.map(p => {
        if (p.status === 'DISBURSED') {
          const resetPayout = { ...p, status: 'PENDING' as const };
          setDocumentData(COLLECTIONS.PAYOUTS, p.id, resetPayout).catch(e => console.error(e));
          return resetPayout;
        }
        return p;
      });

      const loadedPayouts = rebuildPayoutsFromSales(loadedSales, loadedUsers, activeConfig, sanitizedExistingPayouts);

      // Automatic background passcode modification migration is disabled to ensure passcodes are not altered
      // unless explicitly requested by the admin or user.

      // SECURE FIELD SANITIZATION - Strip secret fields of other users for non-admin sessions
      let sanitizedUsers = [...loadedUsers];
      if (sessionParsed.role !== 'ADMIN') {
        sanitizedUsers = loadedUsers.map(u => {
          if (u.id !== sessionParsed.agentId) {
            const { password, bankAccountNumber, ifscCode, aadhar, pan, nominee, nomineeRelation, fatherOrHusbandName, ...publicFields } = u;
            return publicFields as any;
          }
          return u;
        });
      }

      // Fetch user activity logs
      let loadedLogs: UserLog[] = [];
      try {
        loadedLogs = await getCollectionData<UserLog>(COLLECTIONS.USER_LOGS);
        loadedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (err) {
        console.error('Failed to load user logs:', err);
      }
      setUserLogs(loadedLogs);

      setUsers(sanitizedUsers);
      setSales(loadedSales);
      setPayouts(loadedPayouts);
      setNotifications(loadedNotifs);

      setSession(sessionParsed);
      // Only align UI to the session on foreground loads. The 10s background
      // poll also runs through here — resetting these would silently kick an
      // admin out of the Channel Partner Panel (and clobber the agent they are
      // inspecting) on every tick.
      if (!isBackground) {
        setActiveRole(sessionParsed.role);
        if (sessionParsed.agentId) {
          setActiveAgentId(sessionParsed.agentId);
          setSelectedTreeUserId(sessionParsed.agentId);
        }
      }
    } catch (error) {
      console.error("Failed to load private data from Firestore:", error);
      // Fallback to LocalStorage
      const storedUsers = localStorage.getItem('SBR_USERS');
      const storedProjects = localStorage.getItem('SBR_PROJECTS');
      const storedSales = localStorage.getItem('SBR_SALES');
      const storedPayouts = localStorage.getItem('SBR_PAYOUTS');
      const storedConfig = localStorage.getItem('SBR_CONFIG');
      const storedNotifs = localStorage.getItem('SBR_NOTIFICATIONS');

      let activeConfig = INITIAL_MLM_CONFIG;
      if (storedConfig) {
        try {
          activeConfig = JSON.parse(storedConfig);
        } catch (_) {}
      }

      let localSales = storedSales ? JSON.parse(storedSales) : INITIAL_SALES;
      for (const initSale of INITIAL_SALES) {
        if (!localSales.some((s: any) => s.id === initSale.id)) {
          localSales = [initSale, ...localSales];
        }
      }
      let localProjects = sanitizeProjects(storedProjects ? JSON.parse(storedProjects) : INITIAL_PROJECTS);
      let localUsers = normalizeUsersWithSales(storedUsers ? JSON.parse(storedUsers) : INITIAL_USERS, localSales, activeConfig);

      const rawLocalPayouts = storedPayouts ? JSON.parse(storedPayouts) : INITIAL_PAYOUTS;
      const sanitizedLocalPayouts = rawLocalPayouts.map((p: any) => ({ ...p, status: p.status === 'DISBURSED' ? 'PENDING' : p.status }));
      const localPayouts = rebuildPayoutsFromSales(localSales, localUsers, activeConfig, sanitizedLocalPayouts);
      const localNotifs = (storedNotifs ? JSON.parse(storedNotifs) : INITIAL_NOTIFICATIONS).filter((n: any) => localUsers.some(u => u.id === n.userId));

      // Sanitize localUsers if not admin
      let sanitizedLocalUsers = [...localUsers];
      if (sessionParsed.role !== 'ADMIN') {
        sanitizedLocalUsers = localUsers.map(u => {
          if (u.id !== sessionParsed.agentId) {
            const { password, bankAccountNumber, ifscCode, aadhar, pan, nominee, nomineeRelation, fatherOrHusbandName, ...publicFields } = u;
            return publicFields as any;
          }
          return u;
        });
      }

      const storedLogs = localStorage.getItem('SBR_USER_LOGS');
      let localLogs: UserLog[] = [];
      if (storedLogs) {
        try {
          localLogs = JSON.parse(storedLogs);
          localLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (_) {}
      }
      setUserLogs(localLogs);

      setUsers(sanitizedLocalUsers);
      setProjects(localProjects);
      setSales(localSales);
      setPayouts(localPayouts);
      setNotifications(localNotifs);

      setSession(sessionParsed);
      // Same guard as the Firestore path: background polls must not reset the
      // admin's workspace toggle or selected agent.
      if (!isBackground) {
        setActiveRole(sessionParsed.role);
        if (sessionParsed.agentId) {
          setActiveAgentId(sessionParsed.agentId);
          setSelectedTreeUserId(sessionParsed.agentId);
        }
      }
    } finally {
      if (!isBackground) {
        setDbLoading(false);
      }
    }
  };

  // Load from Firestore on mount
  useEffect(() => {
    async function initFirestore() {
      try {
        // Sign in anonymously first to establish secure DB sessions
        await ensureAuthenticated();

        // Load project configuration publicly
        const data = await seedDatabase({
          users: INITIAL_USERS,
          projects: INITIAL_PROJECTS,
          sales: INITIAL_SALES,
          payouts: INITIAL_PAYOUTS,
          config: INITIAL_MLM_CONFIG,
          notifications: INITIAL_NOTIFICATIONS
        });

        const activeConfig = data.config || INITIAL_MLM_CONFIG;
        setConfig(activeConfig);
        
        let loadedProjects = sanitizeProjects(data.projects || INITIAL_PROJECTS);
        deleteDocument(COLLECTIONS.PROJECTS, 'PRJ-251').catch(() => {});
        setProjects(loadedProjects);

        const storedSession = localStorage.getItem('SBR_SESSION');
        if (storedSession) {
          try {
            const parsed = JSON.parse(storedSession);
            await loadPrivateData(parsed, data);
          } catch (e) {
            console.error('Error loading stored session', e);
            setDbLoading(false);
          }
        } else {
          // If no stored session, populate initial public states from fetched data
          const loadedSales = data.sales || INITIAL_SALES;
          setSales(loadedSales);
          setNotifications(data.notifications || INITIAL_NOTIFICATIONS);
          
          let loadedUsers = normalizeUsersWithSales(data.users || INITIAL_USERS, loadedSales, activeConfig);
          loadedUsers = loadedUsers.map(user => ({
            ...user,
            password: getUpgradedPassword(user.id, user.password)
          }));
          setUsers(loadedUsers);

          setDbLoading(false);
        }
      } catch (error) {
        console.error("Initialization failed on mount:", error);
        setDbLoading(false);
      }
    }

    initFirestore();
  }, []);

  const handleManualSync = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    try {
      await ensureAuthenticated();
      const data = await seedDatabase({
        users: INITIAL_USERS,
        projects: INITIAL_PROJECTS,
        sales: INITIAL_SALES,
        payouts: INITIAL_PAYOUTS,
        config: INITIAL_MLM_CONFIG,
        notifications: INITIAL_NOTIFICATIONS
      });
      if (session) {
        await loadPrivateData(session, data, true);
      }
    } catch (e) {
      console.error("Manual sync failed:", e);
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Background polling for multi-session data consistency every 10 seconds
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(async () => {
      if (isSyncingRef.current || isManualSyncing) return;
      isSyncingRef.current = true;
      try {
        await ensureAuthenticated();
        const data = await seedDatabase({
          users: INITIAL_USERS,
          projects: INITIAL_PROJECTS,
          sales: INITIAL_SALES,
          payouts: INITIAL_PAYOUTS,
          config: INITIAL_MLM_CONFIG,
          notifications: INITIAL_NOTIFICATIONS
        });
        await loadPrivateData(session, data, true);
      } catch (error) {
        console.warn("Background auto-sync failed:", error);
      } finally {
        isSyncingRef.current = false;
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [session, isManualSyncing]);

  // Synchronize state changes to LocalStorage as a local fallback backup
  useEffect(() => {
    if (!dbLoading && session) {
      localStorage.setItem('SBR_USERS', JSON.stringify(users));
      localStorage.setItem('SBR_PROJECTS', JSON.stringify(projects));
      localStorage.setItem('SBR_SALES', JSON.stringify(sales));
      localStorage.setItem('SBR_PAYOUTS', JSON.stringify(payouts));
      localStorage.setItem('SBR_CONFIG', JSON.stringify(config));
      localStorage.setItem('SBR_NOTIFICATIONS', JSON.stringify(notifications));
      localStorage.setItem('SBR_USER_LOGS', JSON.stringify(userLogs));
    }
  }, [dbLoading, session, users, projects, sales, payouts, config, notifications, userLogs]);

  // Secure credential verification callback called asynchronously by LoginScreen
  const handleVerifyCredentials = async (identifier: string, pass: string): Promise<{ success: boolean; errorMsg?: string; role?: UserRole; agentId?: string; name?: string; passwordHash?: string }> => {
    try {
      await ensureAuthenticated();
      const inputId = identifier.trim();
      const inputIdUpper = inputId.toUpperCase();

      // Fetch the specific user document directly from Firestore
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('./lib/firebase');
      const userRef = doc(db, COLLECTIONS.USERS, inputIdUpper);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const docUser = docSnap.data() as User;
        const foundAgent: User = {
          ...docUser,
          password: getUpgradedPassword(docUser.id, docUser.password)
        };
        
        // Compute expected passcode hash
        const fallbackPasscodes: Record<string, string> = {
          'SBR': 'SBR@2026',
          'ADMIN1': 'Admin1@SBR',
          'ADMIN2': 'Admin2@SBR'
        };

        let defaultPasscode = '';
        const username = foundAgent.id.toUpperCase();
        if (foundAgent.dob) {
          const parts = foundAgent.dob.split('-');
          if (parts.length === 3) {
            const year = parts[0];
            const month = parts[1];
            const day = parts[2];
            if (year.length === 4 && month.length === 2 && day.length === 2) {
              defaultPasscode = `${username}${day}${month}${year}`;
            }
          }
        }

        const enteredPasswordHash = await hashPassword(pass);
        let isPasscodeCorrect = false;
        const isSecureNode = ['C', 'A1', 'A2', 'RAM', 'MANORANJAN', 'DK', 'VIKAS'].includes(inputIdUpper);

        if (isSecureNode) {
          // Strict verification against database hash for secure/admin nodes
          isPasscodeCorrect = !!foundAgent.password && (enteredPasswordHash === foundAgent.password || pass === foundAgent.password);
        } else {
          // For channel partner users:
          // 1. Configured password (hash or exact match if set)
          // 2. Individual DOB-based passcode if DOB is set on user profile (e.g. SBR001222071989)
          // Generic 'password' and username-as-password defaults are disabled.
          const matchesConfiguredPassword = !!foundAgent.password && (enteredPasswordHash === foundAgent.password || pass === foundAgent.password);
          const matchesDobPasscode = !!defaultPasscode && (pass.toUpperCase() === defaultPasscode.toUpperCase());
          isPasscodeCorrect = matchesConfiguredPassword || matchesDobPasscode;
        }

        if (isPasscodeCorrect) {
          if (foundAgent.status === 'ACTIVE') {
            // Automatic passcode self-healing write-back is disabled to keep original passcodes unchanged.

            const isAdminNode = foundAgent.role === 'ADMIN' && ['C', 'A1', 'A2', 'RAM', 'MANORANJAN', 'VIKAS', 'DK'].includes(foundAgent.id.toUpperCase());
            const role = isAdminNode ? 'ADMIN' : 'AGENT';
            return { success: true, role, agentId: foundAgent.id, name: foundAgent.name, passwordHash: foundAgent.password || 'DEFAULT' };
          } else {
            return { success: false, errorMsg: 'Access Blocked: This account has been marked INACTIVE by Admin.' };
          }
        } else {
          return { success: false, errorMsg: 'Invalid passcode. Please try again.' };
        }
      } else {
        // Check local storage / seed fallback if document doesn't exist in Firestore
        const storedUsersStr = localStorage.getItem('SBR_USERS');
        let localUsers: User[] = INITIAL_USERS;
        if (storedUsersStr) {
          try {
            localUsers = JSON.parse(storedUsersStr);
          } catch (_) {}
        }
        const rawFoundAgent = localUsers.find(u => u.id.toUpperCase() === inputIdUpper);
        if (rawFoundAgent) {
          const foundAgent: User = {
            ...rawFoundAgent,
            password: getUpgradedPassword(rawFoundAgent.id, rawFoundAgent.password)
          };
          const fallbackPasscodes: Record<string, string> = {
            'SBR': 'SBR@2026',
            'ADMIN1': 'Admin1@SBR',
            'ADMIN2': 'Admin2@SBR'
          };

          let defaultPasscode = '';
          const username = foundAgent.id.toUpperCase();
          if (foundAgent.dob) {
            const parts = foundAgent.dob.split('-');
            if (parts.length === 3) {
              const year = parts[0];
              const month = parts[1];
              const day = parts[2];
              if (year.length === 4 && month.length === 2 && day.length === 2) {
                defaultPasscode = `${username}${day}${month}${year}`;
              }
            }
          }

          const enteredPasswordHash = await hashPassword(pass);
          let isPasscodeCorrect = false;
          const isSecureNode = ['C', 'A1', 'A2', 'RAM', 'MANORANJAN', 'DK', 'VIKAS'].includes(inputIdUpper);

          if (isSecureNode) {
            // Strict verification against database hash for secure/admin nodes
            isPasscodeCorrect = !!foundAgent.password && (enteredPasswordHash === foundAgent.password || pass === foundAgent.password);
          } else {
            // For channel partner users:
            // 1. Configured password (hash or exact match if set)
            // 2. Individual DOB-based passcode if DOB is set on user profile (e.g. SBR001222071989)
            // Generic 'password' and username-as-password defaults are disabled.
            const matchesConfiguredPassword = !!foundAgent.password && (enteredPasswordHash === foundAgent.password || pass === foundAgent.password);
            const matchesDobPasscode = !!defaultPasscode && (pass.toUpperCase() === defaultPasscode.toUpperCase());
            isPasscodeCorrect = matchesConfiguredPassword || matchesDobPasscode;
          }

          if (isPasscodeCorrect) {
            if (foundAgent.status === 'ACTIVE') {
              const isAdminNode = foundAgent.role === 'ADMIN' && ['C', 'A1', 'A2', 'RAM', 'MANORANJAN', 'VIKAS', 'DK'].includes(foundAgent.id.toUpperCase());
              const role = isAdminNode ? 'ADMIN' : 'AGENT';
              return { success: true, role, agentId: foundAgent.id, name: foundAgent.name, passwordHash: foundAgent.password || 'DEFAULT' };
            } else {
              return { success: false, errorMsg: 'Access Blocked: This account has been marked INACTIVE by Admin.' };
            }
          } else {
            return { success: false, errorMsg: 'Invalid passcode. Please try again.' };
          }
        }
        return { success: false, errorMsg: 'Account ID not recognized.' };
      }
    } catch (e: any) {
      console.error(e);
      return { success: false, errorMsg: 'Security verification failed: ' + e.message };
    }
  };

  const handleLogin = async (role: UserRole, agentId?: string, passwordHash?: string) => {
    let name = '';
    let resolvedAgentId = agentId || 'C';
    if (role === 'ADMIN' && !agentId) {
      name = 'Company Profile C';
      resolvedAgentId = 'C';
    } else if (agentId) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db } = await import('./lib/firebase');
        const userRef = doc(db, COLLECTIONS.USERS, agentId);
        const docSnap = await getDoc(userRef);
        name = docSnap.exists() ? (docSnap.data() as User).name : 'SBR Broker';
      } catch (e) {
        name = 'SBR Broker';
      }
    } else {
      name = 'SBR Administrator';
    }

    const newSession = { role, agentId: resolvedAgentId, name, passwordHash };
    
    // Clear old cached data keys before establishing the new session
    const keysToRemove = [
      'SBR_USERS',
      'SBR_PROJECTS',
      'SBR_SALES',
      'SBR_PAYOUTS',
      'SBR_CONFIG',
      'SBR_NOTIFICATIONS',
      'SBR_USER_LOGS'
    ];
    keysToRemove.forEach(key => localStorage.removeItem(key));

    localStorage.setItem('SBR_SESSION', JSON.stringify(newSession));
    
    // Immediately align UI state to new session role and agent ID
    setActiveRole(role);
    if (resolvedAgentId) {
      setActiveAgentId(resolvedAgentId);
      setSelectedTreeUserId(resolvedAgentId);
    }
    
    await loadPrivateData(newSession);
  };

  const handleLogout = () => {
    setSession(null);
    setActiveRole('AGENT');
    setActiveAgentId('');
    setSelectedTreeUserId(null);
    setUsers([]);
    setSales([]);
    setPayouts([]);
    setNotifications([]);
    
    // Clear all LocalStorage keys related to SBR
    const keysToRemove = [
      'SBR_SESSION',
      'SBR_USERS',
      'SBR_PROJECTS',
      'SBR_SALES',
      'SBR_PAYOUTS',
      'SBR_CONFIG',
      'SBR_NOTIFICATIONS',
      'SBR_USER_LOGS'
    ];
    keysToRemove.forEach(key => localStorage.removeItem(key));
  };

  // State Change triggers
  const handleUpdateConfig = async (newConfig: MLMConfig) => {
    setConfig(newConfig);
    const normalized = normalizeUsersWithSales(users, sales, newConfig);
    const updatedPayouts = rebuildPayoutsFromSales(sales, normalized, newConfig, payouts);
    setUsers(normalized);
    setPayouts(updatedPayouts);
    try {
      await setDocumentData(COLLECTIONS.CONFIG, 'main_config', newConfig);
      // Save updated payouts if any
      for (const p of updatedPayouts) {
        await setDocumentData(COLLECTIONS.PAYOUTS, p.id, p);
      }
      // Save any users whose designations have changed
      for (const u of normalized) {
        const original = users.find(o => o.id === u.id);
        if (original && original.designation !== u.designation) {
          await setDocumentData(COLLECTIONS.USERS, u.id, u);
        }
      }
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleAddProject = async (newProj: RealEstateProject) => {
    const updated = [...projects, newProj];
    setProjects(updated);
    
    // Create audit notification for admin actions
    const notif: Notification = {
      id: `NOT-${Math.floor(500 + Math.random() * 500)}`,
      userId: 'C',
      title: 'New SBR Project Created',
      message: `Project ${newProj.name} created at ${newProj.location} with Starting Price ${newProj.sqYardStartingPrice} PTS/sq yard.`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      isRead: false
    };

    const updatedNotifs = [notif, ...notifications];
    setNotifications(updatedNotifs);
    
    try {
      await setDocumentData(COLLECTIONS.PROJECTS, newProj.id, newProj);
      await setDocumentData(COLLECTIONS.NOTIFICATIONS, notif.id, notif);
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleUpdateProjects = async (updatedProjects: RealEstateProject[]) => {
    setProjects(updatedProjects);
    try {
      for (const proj of updatedProjects) {
        await setDocumentData(COLLECTIONS.PROJECTS, proj.id, proj);
      }
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleAddUser = async (newUserData: Omit<User, 'totalDirectSales' | 'totalDownlineSales'>) => {
    const hashedPassword = newUserData.password ? await hashPassword(newUserData.password) : '';
    const newUser: User = {
      ...newUserData,
      password: hashedPassword,
      totalDirectSales: 0,
      totalDownlineSales: 0
    };
    const normalizedUsers = normalizeUsersWithSales([...users, newUser], sales, config);
    setUsers(normalizedUsers);
    
    // Create audit notification for admin actions
    const notif: Notification = {
      id: `NOT-${Math.floor(500 + Math.random() * 500)}`,
      userId: newUserData.sponsorId || 'C',
      title: 'New Sourcing Partner Appointed',
      message: `Associate ${newUserData.name} onboarded onto SBR hierarchy with Sponsor ID: ${newUserData.id}.`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      isRead: false
    };

    const updatedNotifs = [notif, ...notifications];
    setNotifications(updatedNotifs);
    
    try {
      // Find the finalized version of the new user in normalizedUsers
      const finalNewUser = normalizedUsers.find(u => u.id === newUser.id) || newUser;
      await setDocumentData(COLLECTIONS.USERS, finalNewUser.id, finalNewUser);

      // Save any other users whose designations might have changed due to this addition
      for (const u of normalizedUsers) {
        if (u.id === newUser.id) continue;
        const oldUser = users.find(old => old.id === u.id);
        if (oldUser && oldUser.designation !== u.designation) {
          await setDocumentData(COLLECTIONS.USERS, u.id, u);
        }
      }

      // Record in Daily Log
      const logId = `LOG-ADD-${Math.floor(1000 + Math.random() * 9000)}`;
      const newLog: UserLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().substring(0, 10),
        action: 'ADDITION',
        userId: finalNewUser.id,
        userName: finalNewUser.name,
        sponsorId: finalNewUser.sponsorId || 'C',
        role: finalNewUser.role,
        performedBy: session ? `${session.name} (${session.role})` : 'Administrator',
        details: `Partner ${finalNewUser.name} (${finalNewUser.id}) onboarded onto SBR hierarchy under Sponsor: ${finalNewUser.sponsorId || 'C'}. Role: ${finalNewUser.role}.`
      };
      await setDocumentData(COLLECTIONS.USER_LOGS, logId, newLog);
      setUserLogs(prev => [newLog, ...prev]);

      await setDocumentData(COLLECTIONS.NOTIFICATIONS, notif.id, notif);
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleToggleUserStatus = async (userId: string) => {
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        const updatedUser = { ...u, status: u.status === 'ACTIVE' ? 'INACTIVE' as const : 'ACTIVE' as const };
        setDocumentData(COLLECTIONS.USERS, userId, updatedUser).catch(console.error);
        return updatedUser;
      }
      return u;
    });
    setUsers(updatedUsers);
  };

  const handleDeleteUser = async (userIdToDelete: string) => {
    const deletedUser = users.find(u => u.id === userIdToDelete);
    if (!deletedUser) return;

    const parentSponsorId = deletedUser.sponsorId || 'C';
    const remainingUsers = users.filter(u => u.id !== userIdToDelete).map(u => {
      if (u.sponsorId === userIdToDelete) {
        return { ...u, sponsorId: parentSponsorId };
      }
      return u;
    });

    const normalizedUsers = normalizeUsersWithSales(remainingUsers, sales, config);
    setUsers(normalizedUsers);

    // Create a system notification for the deletion
    const notif: Notification = {
      id: `NOT-${Math.floor(500 + Math.random() * 500)}`,
      userId: 'C',
      title: 'Sponsoring Partner Deleted',
      message: `Sponsor ${deletedUser.name} (${deletedUser.id}) has been permanently deleted from SBR organization. Downlines reparented to ${parentSponsorId}.`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      isRead: false
    };
    setNotifications(prev => [notif, ...prev]);

    try {
      await deleteDocument(COLLECTIONS.USERS, userIdToDelete);
      
      // Save reparented downlines and recalculated designations to Firestore
      for (const u of normalizedUsers) {
        const oldUser = users.find(old => old.id === u.id);
        if (oldUser) {
          if (oldUser.sponsorId !== u.sponsorId || oldUser.designation !== u.designation) {
            await setDocumentData(COLLECTIONS.USERS, u.id, u);
          }
        }
      }

      // Record in Daily Log
      const logId = `LOG-DEL-${Math.floor(1000 + Math.random() * 9000)}`;
      const newLog: UserLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().substring(0, 10),
        action: 'DELETION',
        userId: deletedUser.id,
        userName: deletedUser.name,
        sponsorId: deletedUser.sponsorId || 'C',
        role: deletedUser.role,
        performedBy: session ? `${session.name} (${session.role})` : 'Administrator',
        details: `Sponsor ${deletedUser.name} (${deletedUser.id}) permanently deleted. Downlines reparented to ${parentSponsorId}.`
      };
      await setDocumentData(COLLECTIONS.USER_LOGS, logId, newLog);
      setUserLogs(prev => [newLog, ...prev]);
      
      await setDocumentData(COLLECTIONS.NOTIFICATIONS, notif.id, notif);
    } catch (err) {
      console.error('Failed to completely delete or update database for user deletion:', err);
    }
  };

  const handleClearNotification = async (notifId: string) => {
    const updatedNotifs = notifications.filter(n => n.id !== notifId);
    setNotifications(updatedNotifs);
    try {
      await deleteDocument(COLLECTIONS.NOTIFICATIONS, notifId);
    } catch (e) {
      console.error('Firestore delete failed', e);
    }
  };

  // SPREAD OVERRIDE PAYOUT GENERATOR FOR MULTI-LEVEL AGREEMENTS
  const handleAddSale = async (saleData: {
    project: string;
    projectId: string;
    unitNumber: string;
    buyerName: string;
    saleValue: number;
    agentId: string;
    saleDate: string;
    referenceNumber: string;
    sizeSqYards: string;
    status: 'BOOKED' | 'CONFIRMED' | 'HOLD';
    bookingStatus?: 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE';
    tokenAmount?: number;
    ratePerSqYard?: number;
  }) => {
    // 1. Log Sales Node
    const newSaleId = `SALE-${Math.floor(300 + Math.random() * 700)}`;
    const sourcingAgent = users.find(u => u.id === saleData.agentId);
    const agentName = sourcingAgent ? sourcingAgent.name : 'Sub Broker';

    const newSale: Sale = {
      id: newSaleId,
      ...saleData,
      agentName,
      payments: saleData.tokenAmount !== undefined ? [{
        id: `PAY-INIT-${newSaleId}`,
        amount: saleData.tokenAmount,
        date: saleData.saleDate,
        paymentMode: 'BANK_TRANSFER',
        notes: 'Initial token amount'
      }] : []
    };

    const updatedSales = [newSale, ...sales];
    setSales(updatedSales);

    // Update targeted project unit status
    let targetProj: RealEstateProject | null = null;
    const selectedUnits = saleData.unitNumber.split(',').map(u => u.trim());
    const updatedProjects = projects.map(proj => {
      if (proj.id === saleData.projectId) {
        const nextProj = {
          ...proj,
          inventory: proj.inventory.map(category => ({
            ...category,
            units: category.units.map(unit => {
              if (selectedUnits.includes(unit.unitNumber)) {
                return {
                  ...unit,
                  status: saleData.status === 'HOLD' ? ('HOLD' as const) : ('BOOKED' as const),
                  bookedByAgentId: saleData.agentId,
                  buyerName: saleData.buyerName
                };
              }
              return unit;
            })
          }))
        };
        targetProj = nextProj;
        return nextProj;
      }
      return proj;
    });
    setProjects(updatedProjects);

    // 2. Build multi-tiered commission payouts and notifications
    const newNotifications: Notification[] = [];
    let currentAgentId: string | null = saleData.agentId;
    let currentLevel = 1;

    let updatedUsers = [...users];

    // Propagate up the sponsor/recruit tree structure to generate notifications
    while (currentAgentId && currentLevel <= config.levels.length) {
      const levelConfig = config.levels.find(l => l.level === currentLevel);
      if (!levelConfig) break;

      const currentAgent = updatedUsers.find(u => u.id === currentAgentId);
      if (!currentAgent) break;

      const value = Math.round(saleData.saleValue);
      const net = value;

      // Trigger user-notification
      const notifId = `NOT-${Math.floor(100 + Math.random() * 900)}`;
      const notifTitle = currentLevel === 1 
        ? 'Personal Sourcing Commission Due'
        : `Indirect Network Overrides (L${currentLevel})`;
      const notifMsg = currentLevel === 1
        ? `We registered your sale of ${saleData.project} (${saleData.unitNumber}) of value ${value} PTS. Scheduled net payout is ${net} PTS.`
        : `A Level ${currentLevel} override of ${net} PTS is pending collection, sourced by downline representative ${agentName} at ${saleData.project}.`;

      newNotifications.push({
        id: notifId,
        userId: currentAgent.id,
        title: notifTitle,
        message: notifMsg,
        amount: net,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        isRead: false
      });

      // Target immediate grandparent sponsor next
      currentAgentId = currentAgent.sponsorId;
      currentLevel++;
    }

    const normalizedUsers = normalizeUsersWithSales(users, updatedSales, config);
    const updatedPayouts = rebuildPayoutsFromSales(updatedSales, normalizedUsers, config, payouts);
    const updatedNotifs = [...newNotifications, ...notifications];

    setPayouts(updatedPayouts);
    setUsers(normalizedUsers);
    setNotifications(updatedNotifs);

    try {
      await setDocumentData(COLLECTIONS.SALES, newSale.id, newSale);
      if (targetProj) {
        await setDocumentData(COLLECTIONS.PROJECTS, (targetProj as RealEstateProject).id, targetProj);
      }
      for (const p of updatedPayouts) {
        await setDocumentData(COLLECTIONS.PAYOUTS, p.id, p);
      }
      for (const n of newNotifications) {
        await setDocumentData(COLLECTIONS.NOTIFICATIONS, n.id, n);
      }
      
      // Save any user who has modified stats or modified designation
      for (const u of normalizedUsers) {
        const original = users.find(o => o.id === u.id);
        if (!original) {
          await setDocumentData(COLLECTIONS.USERS, u.id, u);
        } else if (
          original.designation !== u.designation ||
          original.totalDirectSales !== u.totalDirectSales ||
          original.totalDownlineSales !== u.totalDownlineSales
        ) {
          await setDocumentData(COLLECTIONS.USERS, u.id, u);
        }
      }
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleUpdatePayoutStatus = async (payoutId: string, newStatus: 'PENDING' | 'APPROVED' | 'DISBURSED') => {
    let targetPayout: CommissionPayout | undefined;
    const updatedPayouts = payouts.map(p => {
      if (p.id === payoutId) {
        const nextPay = {
          ...p,
          status: newStatus,
          payoutDate: newStatus === 'DISBURSED' ? new Date().toISOString().split('T')[0] : p.payoutDate
        };
        targetPayout = nextPay;
        return nextPay;
      }
      return p;
    });
    setPayouts(updatedPayouts);

    if (targetPayout) {
      let notifMsg = `Payout status updated to ${newStatus}.`;
      if (newStatus === 'DISBURSED') {
        notifMsg = `Clearance settled for ₹${targetPayout.netCommission.toLocaleString('en-IN')}. Ledger finalized.`;
      } else if (newStatus === 'APPROVED') {
        notifMsg = `Payout sanctioned for ₹${targetPayout.netCommission.toLocaleString('en-IN')}. Awaiting bank dispatch.`;
      }

      const notif: Notification = {
        id: `NOT-${Math.floor(100 + Math.random() * 900)}`,
        userId: targetPayout.agentId,
        title: `Payout Status: ${newStatus}`,
        message: notifMsg,
        amount: targetPayout.netCommission,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        isRead: false
      };
      const updatedNotifs = [notif, ...notifications];
      setNotifications(updatedNotifs);

      try {
        await setDocumentData(COLLECTIONS.PAYOUTS, payoutId, targetPayout);
        await setDocumentData(COLLECTIONS.NOTIFICATIONS, notif.id, notif);
      } catch (e) {
        console.error('Firestore save failed', e);
      }
    }
  };

  const handleApprovePayout = async (payoutId: string) => {
    await handleUpdatePayoutStatus(payoutId, 'APPROVED');
  };

  const handleDisbursePayout = async (payoutId: string) => {
    await handleUpdatePayoutStatus(payoutId, 'DISBURSED');
  };

  const handleUpdateSaleBookingStatus = async (saleId: string, bookingStatus: 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE', tokenAmount?: number) => {
    let targetSale: Sale | undefined;
    const updatedSales = sales.map(s => {
      if (s.id === saleId) {
        const nextSale = { ...s, bookingStatus, tokenAmount };
        targetSale = nextSale;
        return nextSale;
      }
      return s;
    });
    setSales(updatedSales);
    if (targetSale) {
      try {
        await setDocumentData(COLLECTIONS.SALES, saleId, targetSale);
      } catch (e) {
        console.error('Firestore save failed', e);
      }
    }
  };

  const handleUpdateSale = async (updatedSale: Sale) => {
    const updatedSales = sales.map(s => s.id === updatedSale.id ? updatedSale : s);
    const normalizedUsers = normalizeUsersWithSales(users, updatedSales, config);
    const updatedPayouts = rebuildPayoutsFromSales(updatedSales, normalizedUsers, config, payouts);

    setSales(updatedSales);
    setUsers(normalizedUsers);
    setPayouts(updatedPayouts);

    try {
      await setDocumentData(COLLECTIONS.SALES, updatedSale.id, updatedSale);
      for (const p of updatedPayouts) {
        await setDocumentData(COLLECTIONS.PAYOUTS, p.id, p);
      }
      for (const u of normalizedUsers) {
        const original = users.find(o => o.id === u.id);
        if (original && (original.totalDirectSales !== u.totalDirectSales || original.totalDownlineSales !== u.totalDownlineSales || original.designation !== u.designation)) {
          await setDocumentData(COLLECTIONS.USERS, u.id, u);
        }
      }
    } catch (e) {
      console.error('Firestore save failed', e);
    }
  };

  const handleResetUserPassword = async (userId: string, newPass: string) => {
    setIsSavingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      const userToUpdate = users.find(u => u.id === userId);
      if (!userToUpdate) {
        throw new Error("User profile not found in active session.");
      }
      const hashedPass = await hashPassword(newPass);
      const updatedUser = { ...userToUpdate, password: hashedPass };
      
      // Update in Firestore
      await setDocumentData(COLLECTIONS.USERS, userId, updatedUser);
      
      // Update locally
      const updatedUsers = users.map(u => u.id === userId ? updatedUser : u);
      setUsers(updatedUsers);

      // Keep own session active if changing own password, but other devices will be forced to log out
      if (session && session.agentId === userId) {
        const updatedSession = { ...session, passwordHash: hashedPass };
        localStorage.setItem('SBR_SESSION', JSON.stringify(updatedSession));
        setSession(updatedSession);
      }
      
      setPasswordSuccess("Password updated successfully! This change is now secure in SBR Cloud Core.");
      setTimeout(() => {
        setIsSecurityModalOpen(false);
        setNewPassword('');
        setConfirmPassword('');
        setPasswordSuccess('');
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setPasswordError("Failed to save password: " + e.message);
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleAdminUpdateUserProfile = async (userId: string, updatedFields: Partial<User>) => {
    try {
      const userToUpdate = users.find(u => u.id === userId);
      if (!userToUpdate) {
        throw new Error("User profile not found in SBR organization.");
      }
      if (['C', 'A1', 'A2'].includes(userId) && updatedFields.role && updatedFields.role !== 'ADMIN') {
        throw new Error("Security Violation: Core Administrative nodes must maintain their ADMIN status.");
      }
      if (updatedFields.password) {
        updatedFields.password = await hashPasswordIfNeeded(updatedFields.password);
      }
      const updatedUser = { ...userToUpdate, ...updatedFields };
      await setDocumentData(COLLECTIONS.USERS, userId, updatedUser);
      setUsers(prevUsers => prevUsers.map(u => u.id === userId ? updatedUser : u));

      // Keep own session active if changing own password through admin settings
      if (session && session.agentId === userId && updatedFields.password) {
        const updatedSession = { ...session, passwordHash: updatedFields.password };
        localStorage.setItem('SBR_SESSION', JSON.stringify(updatedSession));
        setSession(updatedSession);
      }
    } catch (e: any) {
      console.error(e);
      throw new Error(e.message || "Failed to update broker credentials.");
    }
  };



  if (dbLoading) {
    return (
      <div className="min-h-screen bg-[#fafaf7] flex flex-col items-center justify-center p-6 antialiased font-sans">
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 border-4 border-emerald-800 border-t-transparent rounded-full animate-spin mx-auto" />
          <div>
            <h3 className="text-stone-900 font-bold text-sm tracking-wide uppercase font-mono">Connecting SBR Cloud Core</h3>
            <p className="text-stone-500 text-xs mt-1">Establishing high-availability Firestore cluster connection...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onVerifyCredentials={handleVerifyCredentials}
        theme={theme}
        onToggleTheme={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
      />
    );
  }


  return (
    /*
      overflow-x-clip (not -hidden): `overflow-x: hidden` computes overflow-y to
      `auto`, which makes this div a scroll container and stops the sticky header
      from pinning to the viewport. `clip` still clips horizontally without that.
    */
    <div className="min-h-screen bg-[#fafaf7] text-[#1c1917] flex flex-col antialiased font-sans relative overflow-x-clip">
      {/* Soft Elegant Warm Ambient Light Gradients - highly subtle */}
      <div className="absolute top-0 left-0 w-full h-[500px] overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-25%] left-[-10%] w-[60%] h-[110%] rounded-full bg-amber-500/5 blur-[120px]" />
        <div className="absolute top-[10%] right-[-10%] w-[50%] h-[90%] rounded-full bg-stone-500/5 blur-[120px]" />
      </div>

      {/* Top Banner */}
      <header className="border-b border-stone-200/80 bg-white/85 backdrop-blur-md sticky top-0 z-30 shrink-0 shadow-xs">
        {/*
          Three columns so the brand sits dead-centre regardless of how wide the
          side controls are. Everything else (session badge, role selector, sync,
          passcode, logout) now lives in the slide-over nav.
        */}
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-2.5 flex items-center gap-3">

          {/* Left: menu trigger */}
          <div className="flex-1 flex justify-start">
            <button
              onClick={() => setIsNavOpen(open => !open)}
              aria-label={isNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isNavOpen}
              className="p-2 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 transition-all cursor-pointer shadow-xs shrink-0"
            >
              {isNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Center: logo + name */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-950 flex items-center justify-center text-white font-serif font-semibold select-none shadow-sm shrink-0">
              P
            </div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-stone-900 font-serif whitespace-nowrap">
              SBR <span className="text-emerald-800 font-normal">Sponsors</span>
            </h1>
          </div>

          {/* Right: workspace switch (desktop) + theme switch */}
          <div className="flex-1 flex justify-end items-center gap-2">
            {session?.role === 'ADMIN' && (
              <div className="hidden md:flex p-0.5 bg-stone-100 border border-stone-200 rounded-lg shadow-xs shrink-0">
                <button
                  onClick={() => setActiveRole('ADMIN')}
                  title="Owner / Admin workspace"
                  className={`px-2 py-1 rounded text-[10.5px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    activeRole === 'ADMIN' ? 'bg-emerald-800 text-white shadow-xs' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  👑 <span className="hidden lg:inline">Owner/Admin</span>
                </button>
                <button
                  onClick={() => setActiveRole('AGENT')}
                  title="Channel Partner workspace"
                  className={`px-2 py-1 rounded text-[10.5px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                    activeRole === 'AGENT' ? 'bg-emerald-800 text-white shadow-xs' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  💼 <span className="hidden lg:inline">Partner Panel</span>
                </button>
              </div>
            )}
            <button
              onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="p-2 rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-100 transition-all cursor-pointer shadow-xs shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile workspace switch — its own slim row so the centred brand row
            stays uncrowded on small screens. Admin sessions only. */}
        {session?.role === 'ADMIN' && (
          <div className="md:hidden px-3 pb-2">
            <div className="flex p-0.5 bg-stone-100 border border-stone-200 rounded-lg shadow-xs">
              <button
                onClick={() => setActiveRole('ADMIN')}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeRole === 'ADMIN' ? 'bg-emerald-800 text-white shadow-xs' : 'text-stone-500'
                }`}
              >
                👑 Owner/Admin
              </button>
              <button
                onClick={() => setActiveRole('AGENT')}
                className={`flex-1 px-2 py-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeRole === 'AGENT' ? 'bg-emerald-800 text-white shadow-xs' : 'text-stone-500'
                }`}
              >
                💼 Partner Panel
              </button>
            </div>
          </div>
        )}
      </header>

      {/*
        Left slide-over navigation. Fixed + overlaid so opening it never reflows
        the page content underneath (no layout shift).
      */}
      {isNavOpen && (
        <>
          <div
            onClick={() => setIsNavOpen(false)}
            className="fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs"
            aria-hidden="true"
          />
          <nav className="fixed top-0 left-0 z-50 h-full w-68 max-w-[82vw] bg-white border-r border-stone-200 shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">

            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-800 to-emerald-950 flex items-center justify-center text-white font-serif font-semibold text-sm select-none">
                  P
                </div>
                <span className="font-serif font-bold text-sm text-stone-900">Menu</span>
              </div>
              <button
                onClick={() => setIsNavOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">

              {/* Signed-in identity */}
              {session && (
                <div className="m-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${session.role === 'ADMIN' ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                    <span className="font-semibold text-xs text-stone-900 truncate">{session.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-[8.5px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-stone-200 text-stone-800 font-mono">
                      {session.role === 'ADMIN' ? 'ADMIN' : 'ASSOCIATE'}
                    </span>
                    {session.agentId && (
                      <span className="text-[9.5px] font-mono text-stone-500 truncate">{session.agentId}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Primary navigation */}
              <div className="px-2 pb-1 flex flex-col gap-0.5">
                <span className="px-3 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-wider text-stone-400">Navigate</span>
                {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => handleNavSelect(key)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all cursor-pointer ${
                      activeNav === key
                        ? 'bg-emerald-800 text-white shadow-xs'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>

              {session && (
                <>
                  {/* Workspace switch — administrators only */}
                  {session.role === 'ADMIN' && (
                    <div className="px-2 pt-2 flex flex-col gap-0.5 border-t border-stone-200 mt-2">
                      <span className="px-3 pt-2 pb-1.5 text-[9px] font-bold uppercase tracking-wider text-stone-400">Workspace</span>
                      <button
                        onClick={() => { setActiveRole('ADMIN'); setIsNavOpen(false); }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all cursor-pointer ${
                          activeRole === 'ADMIN'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                        }`}
                      >
                        <span className="w-4 text-center shrink-0">👑</span> Owner / Admin
                      </button>
                      <button
                        onClick={() => { setActiveRole('AGENT'); setIsNavOpen(false); }}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all cursor-pointer ${
                          activeRole === 'AGENT'
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                        }`}
                      >
                        <span className="w-4 text-center shrink-0">💼</span> Channel Partner Panel
                      </button>
                    </div>
                  )}

                  {/* Account actions */}
                  <div className="px-2 pt-2 pb-3 flex flex-col gap-0.5 border-t border-stone-200 mt-2">
                    <span className="px-3 pt-2 pb-1.5 text-[9px] font-bold uppercase tracking-wider text-stone-400">Account</span>

                    <button
                      onClick={handleManualSync}
                      disabled={isManualSyncing}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 shrink-0 text-emerald-800 ${isManualSyncing ? 'animate-spin' : ''}`} />
                      {isManualSyncing ? 'Syncing...' : 'Sync Cloud'}
                    </button>

                    {session.agentId && (
                      <button
                        onClick={() => { setIsSecurityModalOpen(true); setIsNavOpen(false); }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-all cursor-pointer"
                      >
                        <Lock className="w-4 h-4 shrink-0" />
                        Passcode Settings
                      </button>
                    )}

                    <button
                      onClick={() => { setIsNavOpen(false); handleLogout(); }}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left text-rose-700 hover:bg-rose-50 transition-all cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          </nav>
        </>
      )}

      {/* Primary Dashboard Content Area */}
      <main id="sbr-top" className="flex-grow max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {route.startsWith('/profile') ? (
          /* /profile or /profile/<SBR ID> — full partner record */
          <ProfilePage
            users={users}
            sales={sales}
            payouts={payouts}
            profileId={route.split('/')[2]?.toUpperCase() || undefined}
            currentUserId={session?.agentId}
            isAdmin={session?.role === 'ADMIN'}
            onBack={() => navigateTo('/')}
            onUpdateUserProfile={handleAdminUpdateUserProfile}
          />
        ) : route.startsWith('/payouts') ? (
          /* /payouts — the same desk the admin dashboard uses. Admins get the
             full auditable list with sanction/dispatch; channel partners get
             their own payouts, read-only (no handlers passed). */
          <div className="space-y-4">
            <button
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
            >
              ← Back to dashboard
            </button>
            {session?.role === 'ADMIN' ? (
              <PayoutsDesk
                payouts={payouts}
                onApprovePayout={handleApprovePayout}
                onDisbursePayout={handleDisbursePayout}
              />
            ) : (
              <PayoutsDesk
                payouts={payouts.filter(p => p.agentId?.toUpperCase() === session?.agentId?.toUpperCase())}
              />
            )}
          </div>
        ) : route.startsWith('/sales-report') ? (
          /* /sales-report — dense, mobile-first table of the sales ledger.
             Admins see every booking; a channel partner sees only their own. */
          <div className="space-y-4">
            <button
              onClick={() => navigateTo('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
            >
              ← Back to dashboard
            </button>
            <SalesReport
              users={users}
              sales={
                session?.role === 'ADMIN'
                  ? sales
                  : sales.filter(s => s.agentId?.toUpperCase() === session?.agentId?.toUpperCase())
              }
              scopeNote={
                session?.role === 'ADMIN'
                  ? 'Full booking ledger · scroll sideways for all columns'
                  : 'Your sourced bookings · scroll sideways for all columns'
              }
            />
          </div>
        ) : (
          <>
        {activeRole === 'ADMIN' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl bg-white border border-stone-200/80 shadow-xs">
              <h2 className="text-lg font-bold text-stone-900 font-serif">Owner Dashboard & Structural Settings</h2>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Oversee the SBR organization, define percentage payouts and view real-time commission pipelines in PTS.
              </p>
            </div>

            <AdminPanel 
              users={users}
              onAddUser={handleAddUser}
              config={config}
              onUpdateConfig={handleUpdateConfig}
              sales={sales}
              payouts={payouts}
              onToggleUserStatus={handleToggleUserStatus}
              onDeleteUser={handleDeleteUser}
              projects={projects}
              onAddProject={handleAddProject}
              onAddSale={handleAddSale}
              onUpdateProjects={handleUpdateProjects}
              onApprovePayout={handleApprovePayout}
              onDisbursePayout={handleDisbursePayout}
              onUpdatePayoutStatus={handleUpdatePayoutStatus}
              onUpdateSaleBookingStatus={handleUpdateSaleBookingStatus}
              onUpdateSale={handleUpdateSale}
              onUpdateUserProfile={handleAdminUpdateUserProfile}
              currentUserAgentId={session?.agentId}
              userLogs={userLogs}
              navFocus={activeNav}
            />
          </div>
        )}



        {activeRole === 'AGENT' && (
          <div className="space-y-6">
            {/* <div className="glass-panel p-6 rounded-2xl bg-white border border-stone-200/80 shadow-xs">
              <h2 className="text-lg font-bold text-stone-900 font-serif">SBR Channel Partner Deck</h2>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                Track direct sales volumes, strategic team downlines, and check your commission bank slip alerts.
              </p>
            </div> */}

            <AgentPanel 
              users={users}
              sales={sales}
              payouts={payouts}
              notifications={notifications}
              activeAgentId={activeAgentId}
              onSelectAgentId={(id) => setActiveAgentId(id)}
              onClearNotification={handleClearNotification}
              config={config}
              projects={projects}
              onUpdateUserProfile={handleAdminUpdateUserProfile}
              navFocus={activeNav}
            />
          </div>
        )}
          </>
        )}
      </main>

      {/* Bottom Professional Whitelabel Footer */}
      <footer className="bg-stone-100 border-t border-stone-200/80 py-6.5 px-4 md:px-6 shrink-0 text-center">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between text-xs text-stone-500 gap-4">
          <p>© 2026 SBR Associates. Standard Sourcing Operations. All rights reserved.</p>
          <div className="flex gap-4 justify-center text-stone-400">
            <span>Support: malav.nitin199@gmail.com</span>
            <span>|</span>
            <span>Policy: Standard Compliance Manual</span>
          </div>
        </div>
      </footer>

      {/* Security Passcode Modal */}
      {isSecurityModalOpen && session?.agentId && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-white/10 text-amber-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-wide">Secure Passcode Settings</h3>
                  <p className="text-[10px] text-stone-300">Protected by SBR Cloud Core</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsSecurityModalOpen(false);
                  setNewPassword('');
                  setConfirmPassword('');
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                className="text-stone-400 hover:text-white transition-colors cursor-pointer text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPassword.trim()) {
                  setPasswordError('Please enter a valid password.');
                  return;
                }
                if (newPassword !== confirmPassword) {
                  setPasswordError('Passwords do not match.');
                  return;
                }
                handleResetUserPassword(session.agentId!, newPassword);
              }}
              className="p-6 space-y-4"
            >
              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-1 text-xs">
                <div className="text-stone-500">Updating credentials for:</div>
                <div className="font-bold text-stone-800 flex items-center gap-1.5">
                  <span className="font-mono bg-stone-200 px-1.5 py-0.5 rounded text-stone-800">{session.agentId}</span>
                  <span>({session.name})</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wide">New Secure Passcode</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Enter dynamic passcode"
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-emerald-800 focus:bg-white transition-all text-stone-800 font-medium"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-600 uppercase tracking-wide">Confirm Secure Passcode</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="Verify dynamic passcode"
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-300 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-emerald-800 focus:bg-white transition-all text-stone-800 font-medium"
                  required
                />
              </div>

              {passwordError && (
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2">
                  <span>⚠</span>
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-xs font-semibold flex items-center gap-2">
                  <span>✓</span>
                  <span>{passwordSuccess}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSecurityModalOpen(false);
                    setNewPassword('');
                    setConfirmPassword('');
                    setPasswordError('');
                    setPasswordSuccess('');
                  }}
                  className="flex-1 px-4 py-2.5 text-xs font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl transition-all cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPassword || !!passwordSuccess}
                  className="flex-1 px-4 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 border border-emerald-950 rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingPassword ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Secure Passcode</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

