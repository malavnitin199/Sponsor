import React, { useState } from 'react';
import { User, MLMConfig, CommissionPayout, Sale, RealEstateProject, PaymentRecord, UserLog, LeadershipConfig } from '../types';
import { calculatePointsFromSize, getSalePoints, getSaleAgreementValueINR } from '../lib/points';
import TreeVisualizer from './TreeVisualizer';
import PayoutsDesk from './PayoutsDesk';
import { 
  Settings, Users, PlusCircle, Save, TrendingUp, DollarSign, Percent, 
  ShieldCheck, RefreshCw, Star, Map, FileSpreadsheet, Layers, CheckCircle, 
  Search, ShieldAlert, Award, Calendar, Home, CreditCard, Trash2, Plus, Edit, Share2,
  BarChart3, Download, Printer, Key, Smartphone, MessageSquare, Send,
  ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';

interface AdminPanelProps {
  users: User[];
  onAddUser: (user: Omit<User, 'totalDirectSales' | 'totalDownlineSales'>) => Promise<void>;
  config: MLMConfig;
  onUpdateConfig: (config: MLMConfig) => void;
  sales: Sale[];
  payouts: CommissionPayout[];
  onToggleUserStatus: (userId: string) => void;
  onDeleteUser?: (userId: string) => void;
  projects: RealEstateProject[];
  onAddProject: (project: RealEstateProject) => void;
  onAddSale: (saleData: {
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
  }) => void;
  onUpdateProjects: (projects: RealEstateProject[]) => void;
  onApprovePayout: (payoutId: string) => void;
  onDisbursePayout: (payoutId: string) => void;
  onUpdatePayoutStatus?: (payoutId: string, status: 'PENDING' | 'APPROVED' | 'DISBURSED') => void;
  onUpdateSaleBookingStatus?: (saleId: string, bookingStatus: 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE', tokenAmount?: number) => void;
  onUpdateSale?: (sale: Sale) => void;
  onUpdateUserProfile?: (userId: string, updatedFields: Partial<User>) => Promise<void>;
  currentUserAgentId?: string;
  userLogs?: UserLog[];
  /** Active key from the App header nav; drives which sub-tab is revealed. */
  navFocus?: string;
}

type AdminTabKey = 'SETTINGS' | 'AGENTS' | 'PROJECTS' | 'BOOKINGS' | 'SALES' | 'PAYOUTS' | 'LOGS';

/**
 * Sub-tab metadata. `shortLabel` is what fits in the mobile pill bar; the full
 * `label` + `description` are shown in the mobile context line and on sm+.
 */
const ADMIN_TABS: {
  key: AdminTabKey;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { key: 'SETTINGS', label: 'Compensation & Incentives', shortLabel: 'Settings', description: 'Commission slabs (L1–L10), TDS/admin rates, rewards, leadership tiers and T&Cs.', icon: Settings },
  { key: 'AGENTS', label: 'Onboard Sponsors (SBR)', shortLabel: 'Sponsors', description: 'Register partners, browse the team directory and referral tree.', icon: Users },
  { key: 'PROJECTS', label: 'SBR Projects Setup', shortLabel: 'Projects', description: 'Create projects, layout maps, unit inventory and legal metadata.', icon: Map },
  { key: 'BOOKINGS', label: 'Book Plot Inventory', shortLabel: 'Bookings', description: 'Register sale agreements and view live unit availability.', icon: Layers },
  { key: 'SALES', label: 'Corporate Sales Ledger', shortLabel: 'Sales', description: 'Audit trail of sold plots, payment health and milestones.', icon: FileSpreadsheet },
  { key: 'PAYOUTS', label: 'Operations & Payouts Auditing', shortLabel: 'Payouts', description: 'Sanction and disburse commission payouts.', icon: CreditCard },
  { key: 'LOGS', label: 'Daily Lifecycle Logs', shortLabel: 'Logs', description: 'User addition/deletion audit ledger with CSV export.', icon: Calendar },
];

export default function AdminPanel({
  users,
  onAddUser,
  config,
  onUpdateConfig,
  sales,
  payouts,
  onToggleUserStatus,
  projects,
  onAddProject,
  onAddSale,
  onUpdateProjects,
  onApprovePayout,
  onDisbursePayout,
  onUpdatePayoutStatus,
  onUpdateSaleBookingStatus,
  onUpdateSale,
  onUpdateUserProfile,
  currentUserAgentId,
  onDeleteUser,
  userLogs = [],
  navFocus
}: AdminPanelProps) {
  const isFamilyId = (id?: string) => {
    if (!id) return false;
    return ['MANORANJAN', 'RAM', 'DK', 'VIKAS'].includes(id.toUpperCase());
  };

  const isAdminId = (id?: string) => {
    if (!id) return false;
    return ['C', 'A1', 'A2', 'MANORANJAN', 'RAM', 'DK', 'VIKAS'].includes(id.toUpperCase());
  };

  const isRestrictedForCurrentUser = (targetId: string) => {
    if (!currentUserAgentId) return false;
    if (isFamilyId(currentUserAgentId)) {
      return isAdminId(targetId) && targetId.toUpperCase() !== currentUserAgentId.toUpperCase();
    }
    return false;
  };

  // Tabs: SETTINGS, AGENTS, PROJECTS, BOOKINGS, SALES, PAYOUTS, LOGS
  const [activeSubTab, setActiveSubTab] = useState<AdminTabKey>('SETTINGS');
  const [selectedTreeUserId, setSelectedTreeUserId] = useState<string | null>(null);


  const activeTabMeta = ADMIN_TABS.find(t => t.key === activeSubTab) ?? ADMIN_TABS[0];

  // Keep the active pill visible in the mobile scroll strip, whether the change
  // came from a tap on a partly-hidden pill or from the header nav (navFocus).
  const tabBarRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const bar = tabBarRef.current;
    const el = document.getElementById(`admin-tab-${activeSubTab}`);
    if (!bar || !el) return;
    // Only the mobile strip scrolls; on sm+ this is a no-op.
    if (bar.scrollWidth <= bar.clientWidth) return;
    const target = el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2;
    bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [activeSubTab]);

  // Reveal the sub-tab that owns the section the header nav is pointing at.
  React.useEffect(() => {
    if (!navFocus) return;
    // USER_DETAIL/EDIT_DETAIL (→ /profile) and PAYOUTS (→ /payouts) are routes now.
    if (navFocus === 'TEAM' || navFocus === 'SPONSOR_CODE') {
      setActiveSubTab('AGENTS');
    } else if (navFocus === 'INVENTORY') {
      setActiveSubTab('BOOKINGS');
    }
  }, [navFocus]);

  const formatPoints = (val: number) => {
    return `${Math.round(val).toLocaleString()} PTS`;
  };

  const formatINR = (val: number) => {
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  const exportToCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csvString = [headers.join(",")].concat(rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))).join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportLogsCSV = () => {
    const headers = ['Timestamp', 'Action', 'User ID', 'User Name', 'Sponsor ID', 'Role', 'Performed By', 'Details'];
    const rows = userLogs.map(log => [
      log.timestamp || '',
      log.action || '',
      log.userId || '',
      log.userName || '',
      log.sponsorId || '',
      log.role || '',
      log.performedBy || '',
      log.details || ''
    ]);
    exportToCSV('sbr_lifecycle_logs.csv', headers, rows);
  };

  // MLM config state (10 levels)
  const [tds, setTds] = useState(config.tdsPercentage);
  const [adminFee, setAdminFee] = useState(config.adminFeePercentage);
  const [levels, setLevels] = useState(config.levels);
  const [rewards, setRewards] = useState(config.rewards || []);
  const [salaries, setSalaries] = useState(config.salaries || []);
  
  // SBR business configurations
  const [leadershipConfigs, setLeadershipConfigs] = useState(config.leadershipConfigs || []);
  const [promotionalMilestones, setPromotionalMilestones] = useState(config.promotionalMilestones || []);
  const [specialMonthlyOffers, setSpecialMonthlyOffers] = useState(config.specialMonthlyOffers || []);
  const [termsAndConditions, setTermsAndConditions] = useState(config.termsAndConditions || []);

  // Sync state with incoming config prop to ensure DB persistence updates propagate down
  React.useEffect(() => {
    setTds(config.tdsPercentage);
    setAdminFee(config.adminFeePercentage);
    setLevels(config.levels);
    setRewards(config.rewards || []);
    setSalaries(config.salaries || []);
    setLeadershipConfigs(config.leadershipConfigs || []);
    setPromotionalMilestones(config.promotionalMilestones || []);
    setSpecialMonthlyOffers(config.specialMonthlyOffers || []);
    setTermsAndConditions(config.termsAndConditions || []);
  }, [config]);

  // Helper to save entire config payload back to database on every direct interaction
  const saveFullConfig = (updatedFields: Partial<MLMConfig>) => {
    const finalConfig: MLMConfig = {
      tdsPercentage: Number(updatedFields.tdsPercentage ?? tds),
      adminFeePercentage: Number(updatedFields.adminFeePercentage ?? adminFee),
      levels: (updatedFields.levels ?? levels).map(l => ({ ...l, percentage: Number(l.percentage) })),
      rewards: (updatedFields.rewards ?? rewards).map(r => ({ ...r, targetVolume: Number(r.targetVolume) })),
      salaries: (updatedFields.salaries ?? salaries).map(s => ({ ...s, fixedSalary: Number(s.fixedSalary || 0), targetRequired: Number(s.targetRequired || 0) })),
      leadershipConfigs: updatedFields.leadershipConfigs ?? leadershipConfigs,
      promotionalMilestones: updatedFields.promotionalMilestones ?? promotionalMilestones,
      specialMonthlyOffers: updatedFields.specialMonthlyOffers ?? specialMonthlyOffers,
      termsAndConditions: updatedFields.termsAndConditions ?? termsAndConditions
    };
    onUpdateConfig(finalConfig);
  };
  
  // Target index for editing
  const [editingLeadIdx, setEditingLeadIdx] = useState<number | null>(null);
  const [editLeadDesignation, setEditLeadDesignation] = useState('');
  const [editLeadCondition, setEditLeadCondition] = useState('');
  const [editLeadDirectVol, setEditLeadDirectVol] = useState<number>(0);
  const [editLeadIncentivePrice, setEditLeadIncentivePrice] = useState<number>(0);
  const [editLeadRules, setEditLeadRules] = useState('');

  const [editingMilestoneIdx, setEditingMilestoneIdx] = useState<number | null>(null);
  const [editMilestoneCondition, setEditMilestoneCondition] = useState('');
  const [editMilestoneAward, setEditMilestoneAward] = useState('');

  const [editingOfferIdx, setEditingOfferIdx] = useState<number | null>(null);
  const [editOfferVolumeSqYds, setEditOfferVolumeSqYds] = useState<number>(0);
  const [editOfferPaymentPercentage, setEditOfferPaymentPercentage] = useState<number>(0);
  const [editOfferPerkName, setEditOfferPerkName] = useState('');
  const [editOfferStartDate, setEditOfferStartDate] = useState('');
  const [editOfferEndDate, setEditOfferEndDate] = useState('');

  const [editingTermIdx, setEditingTermIdx] = useState<number | null>(null);
  const [editTermText, setEditTermText] = useState('');
  
  const [successMsg, setSuccessMsg] = useState('');

  // SBR Onboarding state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newSponsor, setNewSponsor] = useState('');
  const [newDesignation, setNewDesignation] = useState<User['designation']>('Associate');
  // PII fields
  const [newDob, setNewDob] = useState('');
  const [newAadhar, setNewAadhar] = useState('');
  const [newPan, setNewPan] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newFatherOrHusbandName, setNewFatherOrHusbandName] = useState('');
  const [newPhoto, setNewPhoto] = useState('https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=256');

  // Bank details fields for onboarding
  const [newBankAccountNumber, setNewBankAccountNumber] = useState('');
  const [newIfscCode, setNewIfscCode] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newNominee, setNewNominee] = useState('');
  const [newNomineeRelation, setNewNomineeRelation] = useState('');

  const [createUserSuccess, setCreateUserSuccess] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [agentFilter, setAgentFilter] = useState('');
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  // Admin changing broker credentials state
  const [selectedAgentForPassword, setSelectedAgentForPassword] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editAadhar, setEditAadhar] = useState('');
  const [editPan, setEditPan] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editFatherOrHusbandName, setEditFatherOrHusbandName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [passwordStatusMsg, setPasswordStatusMsg] = useState('');

  // Bank details fields for editing
  const [editBankAccountNumber, setEditBankAccountNumber] = useState('');
  const [editIfscCode, setEditIfscCode] = useState('');
  const [editBranchName, setEditBranchName] = useState('');
  const [editNominee, setEditNominee] = useState('');
  const [editNomineeRelation, setEditNomineeRelation] = useState('');

  // Helper to resolve display passcodes instead of internal crypt hashes
  const getDisplayPasscode = (agentId: string, currentPasswordValue: string, calculatedDefault: string): string => {
    const uppercaseId = agentId.toUpperCase();
    const knownPlaintexts: Record<string, string> = {
      'C': 'e200ad682a8356bdba246349227dbc37f8de423a0331b3eb94a6732a06055e31',
      'A1': '3de60ad432a9387bc298f22a241a0871357f270afa466d653b803fb4aa225a92',
      'A2': 'a8a6c20b538433d2ce90bc0708d17d07b35f6a2627cd11e5338a19284f60b2f3',
      'RAM': '77Uy7qmzmd',
      'MANORANJAN': '7kraxvlWog',
      'DK': 'kfoCCkEBUZ',
      'VIKAS': '5QSRBv28qI'
    };
    
    if (knownPlaintexts[uppercaseId]) {
      return knownPlaintexts[uppercaseId];
    }
    return currentPasswordValue || calculatedDefault;
  };

  /** DOB-derived default passcode: `{ID}{DD}{MM}{YYYY}` (matches App.tsx auth). */
  const getDobPasscode = (agent: User): string => {
    if (!agent.dob) return '';
    const parts = agent.dob.split('-');
    if (parts.length !== 3) return '';
    const [year, month, day] = parts;
    if (year.length !== 4 || month.length !== 2 || day.length !== 2) return '';
    return `${agent.id.toUpperCase()}${day}${month}${year}`;
  };

  /** Opens the credentials editor modal pre-filled with the agent's record.
      Shared by the desktop table row and the mobile card. */
  const openCredentialsEditor = (agent: User) => {
    setSelectedAgentForPassword(agent);
    setEditName(agent.name || '');
    setEditEmail(agent.email || '');
    setEditPhone(agent.phone || '');
    setEditDob(agent.dob || '');
    setEditAadhar(agent.aadhar || '');
    setEditPan(agent.pan || '');
    setEditAddress(agent.address || '');
    setEditFatherOrHusbandName(agent.fatherOrHusbandName || '');
    setEditBankAccountNumber(agent.bankAccountNumber || '');
    setEditIfscCode(agent.ifscCode || '');
    setEditBranchName(agent.branchName || '');
    setEditNominee(agent.nominee || '');
    setEditNomineeRelation(agent.nomineeRelation || '');
    setTempPassword(getDisplayPasscode(agent.id, agent.password || '', getDobPasscode(agent)));
    setPasswordStatusMsg('');
  };

  /** Copies the WhatsApp-style onboarding invite (portal link + ID + passcode). */
  const copyInviteMessage = (agent: User) => {
    const inviteText = `*SBR Operations Portal Invite* 💼\n\n` +
      `Hello *${agent.name}*,\n` +
      `Your account has been onboarded to SBR Sponsors successfully!\n\n` +
      `🔗 *SBR Portal Link:* ${window.location.origin}\n` +
      `🆔 *Associate Sponsor ID:* ${agent.id}\n` +
      `🔑 *Default Passcode:* ${getDisplayPasscode(agent.id, agent.password || '', getDobPasscode(agent))}\n\n` +
      `Please log in using your Sponsor ID and password to manage sales, track downline networks, and view payouts.`;
    navigator.clipboard.writeText(inviteText);
    setCopiedUserId(agent.id);
    setTimeout(() => setCopiedUserId(null), 2000);
  };

  const confirmDeleteAgent = (agent: User) => {
    if (window.confirm(`Are you sure you want to permanently delete sponsor ${agent.name} (${agent.id})? This will remove their user profile. Any immediate downlines will be reparented to their sponsor.`)) {
      onDeleteUser?.(agent.id);
    }
  };

  /** Opens the payment-installments modal for a sale with a reset entry form. */
  const openPaymentsLedger = (saleId: string) => {
    setSelectedPaymentSaleId(saleId);
    setPaymentFormId(null);
    setPaymentFormAmount('');
    setPaymentFormDate(new Date().toISOString().split('T')[0]);
    setPaymentFormMode('BANK_TRANSFER');
    setPaymentFormReference('');
    setPaymentFormNotes('');
  };

  // SBR SMS Dispatch Portal state
  const [selectedAgentForSMS, setSelectedAgentForSMS] = useState<User | null>(null);
  const [smsMessageText, setSmsMessageText] = useState('');
  const [isSendingSMS, setIsSendingSMS] = useState(false);
  const [smsSuccessStatus, setSmsSuccessStatus] = useState<'IDLE' | 'SENDING' | 'SENT' | 'FAILED'>('IDLE');
  const [smsErrorMessage, setSmsErrorMessage] = useState('');

  const openSMSPortal = (agent: User) => {
    setSelectedAgentForSMS(agent);
    setSmsSuccessStatus('IDLE');
    setSmsErrorMessage('');
    
    const username = agent.id.toUpperCase();
    let calculatedDefaultPass = '';
    if (agent.dob) {
      const parts = agent.dob.split('-');
      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        if (year.length === 4 && month.length === 2 && day.length === 2) {
          calculatedDefaultPass = `${username}${day}${month}${year}`;
        }
      }
    }
    const finalPasscode = getDisplayPasscode(agent.id, agent.password || '', calculatedDefaultPass);
    
    const text = `SBR Portal: ${window.location.origin}\nID: ${agent.id}\nPass: ${finalPasscode}`;
      
    setSmsMessageText(text);
  };

  // Project Creation state
  const [projName, setProjName] = useState('');
  const [projLocation, setProjLocation] = useState('');
  const [projStartingPrice, setProjStartingPrice] = useState(15000); // INR per Sq Yard
  const [projMapUrl, setProjMapUrl] = useState('https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=800');
  const [sizeTiersInput, setSizeTiersInput] = useState([
    { unitsRaw: '1-20', size: '100', type: 'Residential' },
    { unitsRaw: '21-25', size: '27', type: 'Commercial' }
  ]);
  const [projSuccess, setProjSuccess] = useState('');
  const [expandedProjUnitsId, setExpandedProjUnitsId] = useState<string | null>(null);

  // New SBR Project metadata states for creation form
  const [projProjectStage, setProjProjectStage] = useState<'Pre-Launch' | 'Under Construction' | 'Near Possession' | 'Launched / Ready to Move'>('Pre-Launch');
  const [projRegistryStatus, setProjRegistryStatus] = useState<'Not Started' | 'In Progress' | 'Completed' | 'On Hold'>('Not Started');
  const [projRegistryDate, setProjRegistryDate] = useState('');
  const [projSroOffice, setProjSroOffice] = useState('');
  const [projMutationStatus, setProjMutationStatus] = useState<'Pending' | 'Applied' | 'Approved' | 'Rejected'>('Pending');
  const [projMutationDate, setProjMutationDate] = useState('');
  const [projMutationNumber, setProjMutationNumber] = useState('');

  // Editing state for an existing project
  const [editingProject, setEditingProject] = useState<RealEstateProject | null>(null);

  // Zoomed Map state
  const [zoomedMap, setZoomedMap] = useState<{ url: string; title: string } | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Plot SBR Booking state
  const [bookProjId, setBookProjId] = useState('');
  const [bookSizeCategory, setBookSizeCategory] = useState('');
  const [bookUnitNumber, setBookUnitNumber] = useState('');
  const [bookBuyerName, setBookBuyerName] = useState('');
  const [bookSaleValue, setBookSaleValue] = useState('');
  const [bookAgentId, setBookAgentId] = useState('');
  const [bookRefNumber, setBookRefNumber] = useState('');
  const [bookStatus, setBookStatus] = useState<'BOOKED' | 'HOLD'>('BOOKED');
  const [bookingFormStatus, setBookingFormStatus] = useState<'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE'>('TOKEN_RECEIVED');
  const [bookingFormTokenAmount, setBookingFormTokenAmount] = useState('75000');
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [bookingError, setBookingError] = useState('');

  const [bookRatePerSqYard, setBookRatePerSqYard] = useState('15000');
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  // Set rate per sq yard when project changes
  React.useEffect(() => {
    const activeProj = projects.find(p => p.id === bookProjId);
    if (activeProj) {
      setBookRatePerSqYard((activeProj.sqYardStartingPrice ?? 15000).toString());
    }
  }, [bookProjId, projects]);

  // Payments Ledger and Editor State
  const [selectedPaymentSaleId, setSelectedPaymentSaleId] = useState<string | null>(null);
  const [paymentFormId, setPaymentFormId] = useState<string | null>(null); // For editing a payment
  const [paymentFormAmount, setPaymentFormAmount] = useState<string>('');
  const [paymentFormDate, setPaymentFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentFormMode, setPaymentFormMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'>('BANK_TRANSFER');
  const [paymentFormReference, setPaymentFormReference] = useState<string>('');
  const [paymentFormNotes, setPaymentFormNotes] = useState<string>('');

  const getSalePayments = (s: Sale): PaymentRecord[] => {
    if (s.payments && s.payments.length > 0) {
      return s.payments;
    }
    if (s.tokenAmount !== undefined) {
      return [{
        id: `PAY-INIT-${s.id}`,
        amount: s.tokenAmount,
        date: s.saleDate || new Date().toISOString().split('T')[0],
        paymentMode: 'BANK_TRANSFER',
        notes: 'Initial token amount'
      }];
    }
    return [];
  };

  const getSaleTotalAgreementValueINR = (s: Sale): number => {
    const sizePart = parseFloat(s.sizeSqYards.replace(/[^\d.]/g, '')) || 0;
    const unitsCount = s.unitNumber.split(',').map(u => u.trim()).filter(Boolean).length || 1;
    const rate = s.ratePerSqYard || 15000;
    return sizePart * unitsCount * rate;
  };

  const handleAddOrUpdatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentSaleId || !onUpdateSale) return;
    const s = sales.find(x => x.id === selectedPaymentSaleId);
    if (!s) return;

    const currentPayments = getSalePayments(s);
    const amountVal = parseFloat(paymentFormAmount) || 0;

    if (paymentFormId) {
      // Editing existing payment
      const updatedPayments = currentPayments.map(p => {
        if (p.id === paymentFormId) {
          return {
            ...p,
            amount: amountVal,
            date: paymentFormDate,
            paymentMode: paymentFormMode,
            reference: paymentFormReference,
            notes: paymentFormNotes
          };
        }
        return p;
      });
      const firstPaymentAmt = updatedPayments[0]?.amount ?? amountVal;
      onUpdateSale({
        ...s,
        payments: updatedPayments,
        tokenAmount: firstPaymentAmt
      });
    } else {
      // Adding new payment
      const newPayment: PaymentRecord = {
        id: `PAY-${Math.floor(1000 + Math.random() * 9000)}`,
        amount: amountVal,
        date: paymentFormDate,
        paymentMode: paymentFormMode,
        reference: paymentFormReference,
        notes: paymentFormNotes
      };
      const updatedPayments = [...currentPayments, newPayment];
      const firstPaymentAmt = updatedPayments[0]?.amount ?? amountVal;
      onUpdateSale({
        ...s,
        payments: updatedPayments,
        tokenAmount: firstPaymentAmt
      });
    }

    // Reset Form
    setPaymentFormId(null);
    setPaymentFormAmount('');
    setPaymentFormDate(new Date().toISOString().split('T')[0]);
    setPaymentFormMode('BANK_TRANSFER');
    setPaymentFormReference('');
    setPaymentFormNotes('');
  };

  const handleEditPaymentClick = (pay: PaymentRecord) => {
    setPaymentFormId(pay.id);
    setPaymentFormAmount(pay.amount.toString());
    setPaymentFormDate(pay.date);
    setPaymentFormMode(pay.paymentMode);
    setPaymentFormReference(pay.reference || '');
    setPaymentFormNotes(pay.notes || '');
  };

  const handleDeletePayment = (paymentId: string) => {
    if (!selectedPaymentSaleId || !onUpdateSale) return;
    const s = sales.find(x => x.id === selectedPaymentSaleId);
    if (!s) return;

    const currentPayments = getSalePayments(s);
    const updatedPayments = currentPayments.filter(p => p.id !== paymentId);
    const firstPaymentAmt = updatedPayments[0]?.amount ?? 0;
    
    onUpdateSale({
      ...s,
      payments: updatedPayments,
      tokenAmount: firstPaymentAmt
    });
    
    if (paymentFormId === paymentId) {
      setPaymentFormId(null);
      setPaymentFormAmount('');
      setPaymentFormDate(new Date().toISOString().split('T')[0]);
      setPaymentFormMode('BANK_TRANSFER');
      setPaymentFormReference('');
      setPaymentFormNotes('');
    }
  };

  const renderPaymentProgress = (s: Sale) => {
    const payments = getSalePayments(s);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalValue = getSaleTotalAgreementValueINR(s);
    const pending = totalValue - totalPaid;
    const pct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;
    return (
      <div className="flex flex-col gap-1 min-w-[130px]">
        <div className="flex justify-between items-center text-[10px] font-sans">
          <span className="font-bold text-stone-800">{formatINR(totalPaid)}</span>
          <span className="text-stone-500 font-bold">({pct.toFixed(1)}%)</span>
        </div>
        <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              pct >= 100 
                ? 'bg-emerald-600' 
                : pct >= 30 
                ? 'bg-blue-600' 
                : 'bg-amber-600'
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between items-center text-[9px] font-mono text-stone-500">
          <span>Val: {formatINR(totalValue)}</span>
          <span className={pending > 0 ? 'text-amber-800 font-bold' : 'text-emerald-800 font-bold'}>
            {pending > 0 ? `Pending: ${formatINR(pending)}` : 'Fully Paid'}
          </span>
        </div>
      </div>
    );
  };

  // Auto-fill points based on Plot Size (Sq Yds) * Selected Units count
  // Formula: points per unit (based on size tier) * Units
  React.useEffect(() => {
    if (bookSizeCategory) {
      const numericSizePart = parseFloat(bookSizeCategory.replace(/[^\d.]/g, '')) || 0;
      const pointsPerUnit = calculatePointsFromSize(numericSizePart);
      const unitCount = selectedUnits.length || 1;
      const calculatedPoints = pointsPerUnit * unitCount;
      
      if (calculatedPoints > 0) {
        setBookSaleValue(calculatedPoints.toString());
      } else {
        setBookSaleValue('');
      }
    } else {
      setBookSaleValue('');
    }
  }, [bookSizeCategory, selectedUnits]);

  // Calculate stats
  const totalSalesVal = sales.reduce((acc, s) => acc + getSalePoints(s), 0);
  const totalCommissionDistributed = payouts
    .filter(p => p.status === 'DISBURSED')
    .reduce((acc, p) => acc + p.netCommission, 0);
  const totalCommissionPending = payouts
    .filter(p => p.status === 'PENDING' || p.status === 'APPROVED')
    .reduce((acc, p) => acc + p.netCommission, 0);

  // Generate mathematical sequential SBR0001 sponsor ID
  const getNextSequentialId = () => {
    const sbrIds = users
      .map(u => u.id)
      .filter(id => id.startsWith('SBR'))
      .map(id => {
        const numPart = id.replace('SBR', '');
        const num = parseInt(numPart, 10);
        return isNaN(num) ? 0 : num;
      });
    const maxNum = sbrIds.length > 0 ? Math.max(...sbrIds) : 0;
    const nextNum = maxNum >= 1 ? maxNum + 1 : 1;
    return `SBR${String(nextNum).padStart(4, '0')}`;
  };

  const handleUpdateConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig({
      tdsPercentage: Number(tds),
      adminFeePercentage: Number(adminFee),
      levels: levels.map(l => ({ ...l, percentage: Number(l.percentage) })),
      rewards: rewards.map(r => ({ ...r, targetVolume: Number(r.targetVolume) })),
      salaries: salaries.map(s => ({ ...s, fixedSalary: Number(s.fixedSalary || 0), targetRequired: Number(s.targetRequired || 0) })),
      leadershipConfigs,
      promotionalMilestones,
      specialMonthlyOffers,
      termsAndConditions
    });
    setSuccessMsg('Sourcing compensation tier, leadership rules, special offers and SBR milestone criteria successfully saved.');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const handleLevelPercentChange = (levelNum: number, value: string) => {
    setLevels(prev =>
      prev.map(item => (item.level === levelNum ? { ...item, percentage: parseFloat(value) || 0 } : item))
    );
  };

  const handleOnboardAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingUser) return;
    if (!newName || !newPhone) {
      setErrorMsg('Full Name and Mobile Number are required.');
      return;
    }
    if (!newAadhar || !newPan) {
      setErrorMsg('Govt Compliance: Aadhaar Card and PAN Card details are mandatory to issue commission payouts.');
      return;
    }

    const normalizedNewAadhar = newAadhar.trim().replace(/[-\s]/g, '');
    const normalizedNewPan = newPan.trim().replace(/[-\s]/g, '').toUpperCase();

    const isDuplicateAadhar = users.some(u => {
      if (!u.aadhar) return false;
      return u.aadhar.trim().replace(/[-\s]/g, '') === normalizedNewAadhar;
    });

    const isDuplicatePan = users.some(u => {
      if (!u.pan) return false;
      return u.pan.trim().replace(/[-\s]/g, '').toUpperCase() === normalizedNewPan;
    });

    if (isDuplicateAadhar) {
      setErrorMsg(`Validation Error: Aadhaar Card number '${newAadhar}' is already registered to another user.`);
      return;
    }
    if (isDuplicatePan) {
      setErrorMsg(`Validation Error: PAN Card number '${newPan.toUpperCase()}' is already registered to another user.`);
      return;
    }

    setIsSubmittingUser(true);
    setErrorMsg('');
    setCreateUserSuccess('');

    const assignedId = getNextSequentialId();

    const newlyCreatedAgent: User = {
      id: assignedId,
      name: newName,
      email: newEmail || undefined,
      phone: newPhone,
      role: 'AGENT',
      sponsorId: newSponsor || null,
      joinedDate: new Date().toISOString().split('T')[0],
      designation: newDesignation,
      status: 'ACTIVE',
      dob: newDob || '1990-01-01',
      aadhar: newAadhar,
      pan: newPan,
      address: newAddress || 'Sub-broker Office network',
      fatherOrHusbandName: newFatherOrHusbandName || undefined,
      photo: newPhoto,
      totalDirectSales: 0,
      totalDownlineSales: 0,
      bankAccountNumber: newBankAccountNumber || undefined,
      ifscCode: newIfscCode || undefined,
      branchName: newBranchName || undefined,
      nominee: newNominee || undefined,
      nomineeRelation: newNomineeRelation || undefined
    };

    try {
      await onAddUser(newlyCreatedAgent);

      setCreateUserSuccess(`Successfully onboarded ${newName} as SBR Certified Partner. ID: ${assignedId}`);
      setErrorMsg('');
      setNewName('');
      setNewEmail('');
      setNewPhone('');
      setNewSponsor('');
      setNewDob('');
      setNewAadhar('');
      setNewPan('');
      setNewAddress('');
      setNewFatherOrHusbandName('');
      setNewBankAccountNumber('');
      setNewIfscCode('');
      setNewBranchName('');
      setNewNominee('');
      setNewNomineeRelation('');
      setTimeout(() => setCreateUserSuccess(''), 6000);
    } catch (err: any) {
      console.error("Onboarding failed:", err);
      setErrorMsg(err.message || 'Onboarding failed due to cloud synchronization issues.');
    } finally {
      setIsSubmittingUser(false);
    }

    // Auto-trigger the secure credentials SMS Portal for the newly added user! (Removed/Disabled for now until DLT registration)
    /*
    setTimeout(() => {
      openSMSPortal(newlyCreatedAgent);
    }, 600);
    */
  };

  // Add Project
  const handleAddNewProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName || !projLocation) {
      setErrorMsg('Project Name and Location/Address are required metadata fields.');
      return;
    }

    const uniqueProjId = `PRJ-${Math.floor(100 + Math.random() * 900)}`;
    
    // Group units by size category so they conform to the standard layout
    const groupedBySubSize: { [sizeKey: string]: any[] } = {};

    sizeTiersInput.forEach(tier => {
      const sizeNum = parseFloat(tier.size) || 0;
      const sizeLabel = `${sizeNum} Sq Yards`;
      const typeLabel = tier.type || 'Residential';

      // Parse the units raw text which may contain ranges like "1-20" or comma-separated lists
      const rawParts = tier.unitsRaw.split(',').map(p => p.trim()).filter(p => p !== '');
      const unitsArr: any[] = [];

      rawParts.forEach(part => {
        const rangeMatch = part.match(/^(.*?)\s*(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
          const prefix = rangeMatch[1] || '';
          const startNum = parseInt(rangeMatch[2], 10);
          const endNum = parseInt(rangeMatch[3], 10);
          const start = Math.min(startNum, endNum);
          const end = Math.max(startNum, endNum);
          // Limit to 400 to prevent accidental infinite loop
          const limit = Math.min(end, start + 400);
          for (let i = start; i <= limit; i++) {
            unitsArr.push({
              unitNumber: `${prefix}${i}`,
              status: 'AVAILABLE' as const,
              bookedByAgentId: null,
              buyerName: null,
              type: typeLabel
            });
          }
        } else {
          unitsArr.push({
            unitNumber: part,
            status: 'AVAILABLE' as const,
            bookedByAgentId: null,
            buyerName: null,
            type: typeLabel
          });
        }
      });

      if (!groupedBySubSize[sizeLabel]) {
        groupedBySubSize[sizeLabel] = [];
      }
      groupedBySubSize[sizeLabel].push(...unitsArr);
    });

    const formattedInventory = Object.keys(groupedBySubSize).map(sizeKey => ({
      size: sizeKey,
      units: groupedBySubSize[sizeKey]
    }));

    // Min and Max pricing estimation (Sq yard * starting rate)
    const basePrices = sizeTiersInput.map(t => {
      const numericSize = parseFloat(t.size) || 100;
      return numericSize * projStartingPrice;
    });
    const minVal = basePrices.length ? Math.min(...basePrices) : projStartingPrice * 100;
    const maxVal = basePrices.length ? Math.max(...basePrices) : projStartingPrice * 200;

    onAddProject({
      id: uniqueProjId,
      name: projName,
      location: projLocation,
      sqYardStartingPrice: Number(projStartingPrice),
      minPrice: minVal,
      maxPrice: maxVal,
      imageMapUrl: projMapUrl,
      inventory: formattedInventory,
      projectStage: projProjectStage,
      registryStatus: projRegistryStatus,
      registryDate: projRegistryDate,
      sroOffice: projSroOffice,
      mutationStatus: projMutationStatus,
      mutationDate: projMutationDate,
      mutationNumber: projMutationNumber
    });

    setProjSuccess(`Successfully created Real Estate Project: "${projName}" with ${formattedInventory.reduce((acc, c) => acc + c.units.length, 0)} registered inventory units!`);
    setProjName('');
    setProjLocation('');
    setProjMapUrl('https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=800');
    setProjProjectStage('Pre-Launch');
    setProjRegistryStatus('Not Started');
    setProjRegistryDate('');
    setProjSroOffice('');
    setProjMutationStatus('Pending');
    setProjMutationDate('');
    setProjMutationNumber('');
    setSizeTiersInput([
      { unitsRaw: '1-20', size: '100', type: 'Residential' },
      { unitsRaw: '21-25', size: '27', type: 'Commercial' }
    ]);
    setTimeout(() => setProjSuccess(''), 5000);
  };

  const handleUpdateProjectMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    const updated = projects.map(p => {
      if (p.id === editingProject.id) {
        return {
          ...p,
          projectStage: editingProject.projectStage,
          registryStatus: editingProject.registryStatus,
          registryDate: editingProject.registryDate,
          sroOffice: editingProject.sroOffice,
          mutationStatus: editingProject.mutationStatus,
          mutationDate: editingProject.mutationDate,
          mutationNumber: editingProject.mutationNumber
        };
      }
      return p;
    });

    onUpdateProjects(updated);
    setEditingProject(null);
  };

  // Trigger SBR Booking
  const handleBookInventorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUnitNumber = selectedUnits.join(', ');
    if (!bookProjId || !bookSizeCategory || selectedUnits.length === 0 || !bookBuyerName || !bookSaleValue || !bookAgentId) {
      setBookingError('All fields including selected unit(s) and channel partner are required to log an agreement.');
      return;
    }

    const activeProj = projects.find(p => p.id === bookProjId);
    if (!activeProj) return;

    onAddSale({
      project: activeProj.name,
      projectId: bookProjId,
      unitNumber: finalUnitNumber,
      buyerName: bookBuyerName,
      saleValue: Number(bookSaleValue),
      agentId: bookAgentId,
      saleDate: new Date().toISOString().split('T')[0],
      referenceNumber: bookRefNumber || `REF-ONLINE-${Math.floor(100000 + Math.random() * 900000)}`,
      sizeSqYards: bookSizeCategory.includes('Sq Yards') ? bookSizeCategory : `${bookSizeCategory} Sq Yards`,
      status: bookStatus === 'HOLD' ? 'HOLD' : 'BOOKED',
      bookingStatus: bookingFormStatus,
      tokenAmount: Number(bookingFormTokenAmount),
      ratePerSqYard: Number(bookRatePerSqYard)
    });

    setBookingSuccess(`Registered booking for ${finalUnitNumber} of project "${activeProj.name}" by partner ${bookAgentId}! Level commissions queued for audit.`);
    setBookingError('');
    setBookBuyerName('');
    setBookSaleValue('');
    setBookRefNumber('');
    setBookUnitNumber('');
    setSelectedUnits([]);
    setTimeout(() => setBookingSuccess(''), 5000);
  };

  const handleSizeTierChange = (index: number, field: 'size' | 'unitsRaw' | 'type', value: string) => {
    const updated = [...sizeTiersInput];
    updated[index][field] = value;
    setSizeTiersInput(updated);
  };

  const addSizeTierRow = () => {
    setSizeTiersInput([...sizeTiersInput, { size: '100', unitsRaw: '', type: 'Residential' }]);
  };

  const removeSizeTierRow = (index: number) => {
    setSizeTiersInput(sizeTiersInput.filter((_, i) => i !== index));
  };

  // Filter projects units by category
  const selectedProjObject = projects.find(p => p.id === bookProjId);
  const sizeInventory = selectedProjObject?.inventory.find(inv => inv.size === bookSizeCategory);
  const unitsToBook = sizeInventory
    ? sizeInventory.units.filter(u => u.status === 'AVAILABLE')
    : (selectedProjObject?.inventory.flatMap(inv => inv.units).filter(u => u.status === 'AVAILABLE') || []);

  const filteredAgents = users.filter(u =>
    u.name.toLowerCase().includes(agentFilter.toLowerCase()) ||
    u.id.toLowerCase().includes(agentFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Admin Panel sub tab bar.
          Mobile: one horizontally-scrollable row of compact pills (short labels,
          active pill auto-centred) + a context line naming the active section.
          Desktop (sm+): wraps into the familiar multi-row bar with full labels.
          NOTE: the ui/edit merge repeatedly reintroduces the old hardcoded
          buttons here, interleaving them with this ADMIN_TABS bar and leaving an
          unclosed <button> that breaks the build. Keep this single map. */}
      <div className="bg-stone-100 border border-stone-200 rounded-2xl overflow-hidden">
        <div
          ref={tabBarRef}
          className="flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-x-visible gap-1 p-1.5 custom-scrollbar"
        >
          {ADMIN_TABS.map(({ key, label, shortLabel, icon: Icon }) => (
            <button
              key={key}
              id={`admin-tab-${key}`}
              onClick={() => setActiveSubTab(key)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeSubTab === key
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Mobile-only context line: full name + purpose of the open section */}
        <div className="sm:hidden px-4 py-2 border-t border-stone-200 bg-white">
          <p className="text-[11px] font-bold text-stone-900">{activeTabMeta.label}</p>
          <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">{activeTabMeta.description}</p>
        </div>
      </div>

      {/* SUB-TAB PANELS */}
      
      {/* 1. COMPREHENSIVE COMPENSATION & INCENTIVES */}
      {activeSubTab === 'SETTINGS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50">
              <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                <Settings className="w-4.5 h-4.5 text-emerald-800" /> SBR Incentive Commission Engine (L1 to L10)
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Configure commission slices dynamically. Percentage overrides distribute deep across up to 10 sponsor nodes on bookings.
              </p>
            </div>

            <form onSubmit={handleUpdateConfigSubmit} className="p-5 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block mb-1">TDS Rate (Section 194H)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={tds}
                      onChange={(e) => setTds(parseFloat(e.target.value) || 0)}
                      className="w-full pr-8 pl-3 py-2 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <Percent className="absolute right-3 top-3 w-3.5 h-3.5 text-stone-400" />
                  </div>
                  <p className="text-[9.5px] text-stone-500 mt-1">Government mandated withholding rate on commissions</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block mb-1">SBR Admin Retention Fee (Flat ₹)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="100"
                      min="0"
                      value={adminFee}
                      onChange={(e) => setAdminFee(parseFloat(e.target.value) || 0)}
                      className="w-full pr-8 pl-3 py-2 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <DollarSign className="absolute right-3 top-3 w-3.5 h-3.5 text-stone-400" />
                  </div>
                  <p className="text-[9.5px] text-stone-500 mt-1">Flat administrative service fee deduction in ₹ per payout</p>
                </div>
              </div>

              {/* Commission royalties list */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-stone-600 uppercase tracking-wider block font-sans">Commission Slab Override Grid (L1 to L10)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-stone-200 rounded-xl p-3 bg-stone-50">
                  {levels.map((lvl) => (
                    <div key={lvl.level} className="flex items-center justify-between gap-3 text-xs p-1.5 rounded bg-white border border-stone-200">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-emerald-50 text-emerald-800 text-[10px] font-bold flex items-center justify-center border border-emerald-200 font-mono">
                          L{lvl.level}
                        </span>
                        <span className="text-stone-700 font-medium font-sans text-[11px]">
                          {lvl.level === 1 ? 'Direct Sourcing Broker' : `Sponsor Partner (Tier ${lvl.level})`}
                        </span>
                      </div>
                      <div className="relative w-23">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="100"
                          value={lvl.percentage}
                          onChange={(e) => handleLevelPercentChange(lvl.level, e.target.value)}
                          className="w-full pr-6 pl-2 py-1 text-right text-xs font-mono font-bold rounded border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        />
                        <Percent className="absolute right-1 top-2.5 w-3 h-3 text-stone-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {successMsg && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 stroke-2 text-emerald-800" />
                  {successMsg}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs uppercase tracking-wider font-sans"
              >
                <Save className="w-3.5 h-3.5" /> Save Compensation Slab Rules
              </button>
            </form>
          </div>

          {/* RIGHT SIDE: INTERACTIVE MOTIVATIONAL CONFIGURATIONS */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* A. Leadership Configurations List Editor */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-stone-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                    <Award className="w-4 h-4 text-emerald-800" /> SBR Leadership Configurations
                  </h3>
                  <p className="text-[9px] text-stone-500">Tier designation conditions and incentive rates</p>
                </div>
              </div>
              <div className="p-4 space-y-3.5">
                <div className="space-y-2">
                  {leadershipConfigs.map((cfg, idx) => (
                    <div key={idx}>
                      {editingLeadIdx === idx ? (
                        <div className="bg-emerald-50/45 border border-emerald-200 rounded-xl p-3 text-xs space-y-2 flex flex-col font-sans">
                          <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide">Edit Designation Config</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">Designation</label>
                              <input
                                type="text"
                                value={editLeadDesignation}
                                onChange={(e) => setEditLeadDesignation(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">Condition</label>
                              <input
                                type="text"
                                value={editLeadCondition}
                                onChange={(e) => setEditLeadCondition(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">Min Direct Vol (sq yd)</label>
                              <input
                                type="number"
                                value={editLeadDirectVol}
                                onChange={(e) => setEditLeadDirectVol(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-mono font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">Incentive Price (₹)</label>
                              <input
                                type="number"
                                value={editLeadIncentivePrice}
                                onChange={(e) => setEditLeadIncentivePrice(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-mono font-bold"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5">Sponsor / Lineage Rules</label>
                              <input
                                type="text"
                                value={editLeadRules}
                                onChange={(e) => setEditLeadRules(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingLeadIdx(null)}
                              className="px-2.5 py-1 text-[10px] bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editLeadDesignation.trim()) {
                                  const updated = [...leadershipConfigs];
                                  updated[idx] = {
                                    ...updated[idx],
                                    designation: editLeadDesignation as LeadershipConfig['designation'],
                                    condition: editLeadCondition,
                                    directVol: editLeadDirectVol,
                                    incentivePrice: editLeadIncentivePrice,
                                    rules: editLeadRules
                                  };
                                  setLeadershipConfigs(updated);
                                  setEditingLeadIdx(null);
                                  saveFullConfig({ leadershipConfigs: updated });
                                }
                              }}
                              className="px-2.5 py-1 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900 uppercase text-[10.5px] tracking-wide">{cfg.designation}</span>
                              <span className="text-[9px] bg-emerald-50 text-emerald-800 font-mono font-bold px-1.5 py-0.5 rounded">
                                ₹{(cfg.incentivePrice || 0).toLocaleString()}/sq yd
                              </span>
                            </div>
                            {cfg.condition && (
                              <p className="text-[10px] text-stone-600">Condition: <strong className="text-stone-800">{cfg.condition}</strong></p>
                            )}
                            <p className="text-[10px] text-stone-600">Min Direct Vol: <strong className="text-stone-900">{(cfg.directVol || 0).toLocaleString()} sq yd</strong></p>
                            <p className="text-[9.5px] text-stone-500 leading-normal italic">Lineage: {cfg.rules}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingLeadIdx(idx);
                                setEditLeadDesignation(cfg.designation || '');
                                setEditLeadCondition(cfg.condition || '');
                                setEditLeadDirectVol(cfg.directVol || 0);
                                setEditLeadIncentivePrice(cfg.incentivePrice || 0);
                                setEditLeadRules(cfg.rules || '');
                              }}
                              className="p-1.5 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 hover:text-emerald-700 rounded-lg text-stone-400 transition-all cursor-pointer"
                              title="Edit Condition"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = leadershipConfigs.filter((_, i) => i !== idx);
                                setLeadershipConfigs(updated);
                                saveFullConfig({ leadershipConfigs: updated });
                              }}
                              className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 hover:text-rose-600 rounded-lg text-stone-400 transition-all cursor-pointer"
                              title="Delete Condition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline Add Form */}
                <div className="p-3 bg-stone-50/50 border border-dashed border-stone-200 rounded-xl space-y-2.5">
                  <span className="text-[9.5px] font-bold text-stone-600 uppercase tracking-wide block font-sans">Add Custom Designation Config</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <input
                      type="text"
                      id="lead-rank"
                      placeholder="Designation Name (e.g. GM)"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                    />
                    <input
                      type="text"
                      id="lead-cond"
                      placeholder="Condition (e.g. 10 Direct, 100 Team)"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                    />
                    <input
                      type="number"
                      id="lead-vol"
                      placeholder="Req. Volume (sq yd)"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                    />
                    <input
                      type="number"
                      id="lead-price"
                      placeholder="Incentive Price (₹)"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                    />
                    <input
                      type="text"
                      id="lead-lineage"
                      placeholder="Sponsor / Lineage Rules"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400 col-span-2"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const rankEl = document.getElementById('lead-rank') as HTMLInputElement;
                      const condEl = document.getElementById('lead-cond') as HTMLInputElement;
                      const volEl = document.getElementById('lead-vol') as HTMLInputElement;
                      const priceEl = document.getElementById('lead-price') as HTMLInputElement;
                      const rulesEl = document.getElementById('lead-lineage') as HTMLInputElement;
                      if (rankEl && volEl && priceEl && rulesEl && rankEl.value) {
                        const updated = [
                          ...leadershipConfigs,
                          {
                            designation: rankEl.value as LeadershipConfig['designation'],
                            condition: condEl ? condEl.value : '',
                            directVol: Number(volEl.value) || 0,
                            incentivePrice: Number(priceEl.value) || 0,
                            rules: rulesEl.value || 'None'
                          }
                        ];
                        setLeadershipConfigs(updated);
                        saveFullConfig({ leadershipConfigs: updated });
                        rankEl.value = '';
                        if (condEl) condEl.value = '';
                        volEl.value = '';
                        priceEl.value = '';
                        rulesEl.value = '';
                      }
                    }}
                    className="w-full py-1.5 bg-stone-900 text-white rounded text-[10.5px] font-bold tracking-wider hover:bg-stone-800 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Append Designation
                  </button>
                </div>
              </div>
            </div>

            {/* B. Sponsoring Milestones List Editor */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50/50">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <Award className="w-4 h-4 text-emerald-800" /> SBR Sponsoring Milestones
                </h3>
                <p className="text-[9px] text-stone-500">Active milestone incentives to keep brokers active</p>
              </div>
              <div className="p-4 space-y-3.5">
                <div className="space-y-2">
                  {promotionalMilestones.map((m, idx) => (
                    <div key={idx}>
                      {editingMilestoneIdx === idx ? (
                        <div className="bg-emerald-50/45 border border-emerald-200 rounded-xl p-3 text-xs space-y-2 flex flex-col font-sans">
                          <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide">Edit Milestone Config</span>
                          <div className="space-y-2">
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Milestone Criteria</label>
                              <input
                                type="text"
                                value={editMilestoneCondition}
                                onChange={(e) => setEditMilestoneCondition(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Reward Perks</label>
                              <input
                                type="text"
                                value={editMilestoneAward}
                                onChange={(e) => setEditMilestoneAward(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingMilestoneIdx(null)}
                              className="px-2.5 py-1 text-[10px] bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editMilestoneCondition.trim() && editMilestoneAward.trim()) {
                                  const updated = [...promotionalMilestones];
                                  updated[idx] = {
                                    ...updated[idx],
                                    condition: editMilestoneCondition,
                                    award: editMilestoneAward
                                  };
                                  setPromotionalMilestones(updated);
                                  setEditingMilestoneIdx(null);
                                  saveFullConfig({ promotionalMilestones: updated });
                                }
                              }}
                              className="px-2.5 py-1 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs gap-3">
                          <div className="font-sans">
                            <strong className="text-stone-800 block">Condition: {m.condition}</strong>
                            <span className="text-emerald-800 font-semibold text-[11px] block mt-1">Reward Perks: {m.award}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMilestoneIdx(idx);
                                setEditMilestoneCondition(m.condition || '');
                                setEditMilestoneAward(m.award || '');
                              }}
                              className="p-1.5 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 hover:text-emerald-700 rounded-lg text-stone-400 transition-all cursor-pointer"
                              title="Edit Milestone"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = promotionalMilestones.filter((_, i) => i !== idx);
                                setPromotionalMilestones(updated);
                                saveFullConfig({ promotionalMilestones: updated });
                              }}
                              className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 hover:text-rose-600 rounded-lg text-stone-400 transition-all cursor-pointer"
                              title="Delete Milestone"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline Add */}
                <div className="p-3 bg-stone-50/50 border border-dashed border-stone-200 rounded-xl space-y-2 flex flex-col">
                  <input
                    type="text"
                    id="milestone-condition"
                    placeholder="Milestone Criteria (e.g. Settle 4 Plot bookings)"
                    className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                  />
                  <input
                    type="text"
                    id="milestone-reward"
                    placeholder="Reward item (e.g. Laptop bag + Trophy)"
                    className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const condEl = document.getElementById('milestone-condition') as HTMLInputElement;
                      const rewEl = document.getElementById('milestone-reward') as HTMLInputElement;
                      if (condEl && rewEl && condEl.value && rewEl.value) {
                        const updated = [
                          ...promotionalMilestones,
                          {
                            id: `prm-${Date.now()}`,
                            condition: condEl.value,
                            award: rewEl.value
                          }
                        ];
                        setPromotionalMilestones(updated);
                        saveFullConfig({ promotionalMilestones: updated });
                        condEl.value = '';
                        rewEl.value = '';
                      }
                    }}
                    className="w-full py-1.5 bg-stone-900 text-white rounded text-[10.5px] font-bold tracking-wider hover:bg-stone-800 transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Append Milestone
                  </button>
                </div>
              </div>
            </div>

            {/* C. Special Monthly Offers List Editor */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-stone-200 bg-stone-50/50">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <Star className="w-4 h-4 text-emerald-800" /> Special Monthly SBR Offers
                </h3>
                <p className="text-[9px] text-stone-500">Limited-time incentives configured in dashboard</p>
              </div>
              <div className="p-4 space-y-3.5">
                <div className="space-y-2">
                  {specialMonthlyOffers.map((o, idx) => (
                    <div key={idx}>
                      {editingOfferIdx === idx ? (
                        <div className="bg-emerald-50/45 border border-emerald-200 rounded-xl p-3 text-xs space-y-2 flex flex-col font-sans">
                          <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide">Edit Special Offer Config</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Target Volume (sq yd)</label>
                              <input
                                type="number"
                                value={editOfferVolumeSqYds}
                                onChange={(e) => setEditOfferVolumeSqYds(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-mono font-bold"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Required Down Payment %</label>
                              <input
                                type="number"
                                value={editOfferPaymentPercentage}
                                onChange={(e) => setEditOfferPaymentPercentage(Number(e.target.value) || 0)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-mono font-bold"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Reward Offering</label>
                              <input
                                type="text"
                                value={editOfferPerkName}
                                onChange={(e) => setEditOfferPerkName(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Start Date</label>
                              <input
                                type="date"
                                value={editOfferStartDate}
                                onChange={(e) => setEditOfferStartDate(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-stone-500 uppercase block mb-0.5 font-sans">Expiry Date</label>
                              <input
                                type="date"
                                value={editOfferEndDate}
                                onChange={(e) => setEditOfferEndDate(e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingOfferIdx(null)}
                              className="px-2.5 py-1 text-[10px] bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editOfferVolumeSqYds > 0 && editOfferPerkName.trim()) {
                                  const updated = [...specialMonthlyOffers];
                                  updated[idx] = {
                                    ...updated[idx],
                                    volumeSqYds: editOfferVolumeSqYds,
                                    paymentPercentage: editOfferPaymentPercentage,
                                    perkName: editOfferPerkName,
                                    startDate: editOfferStartDate || undefined,
                                    endDate: editOfferEndDate || undefined
                                  };
                                  setSpecialMonthlyOffers(updated);
                                  setEditingOfferIdx(null);
                                  saveFullConfig({ specialMonthlyOffers: updated });
                                }
                              }}
                              className="px-2.5 py-1 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs gap-3 font-sans">
                          <div className="font-sans space-y-0.5">
                            <strong className="text-stone-800 block text-stone-800">Target Volume: {o.volumeSqYds} SQ YD</strong>
                            <p className="text-[10px] text-stone-500">Required Down Payment receipt: {o.paymentPercentage}%</p>
                            {o.startDate && o.endDate ? (
                              <p className="text-[10px] font-medium text-amber-700 bg-amber-50/50 px-1.5 py-0.5 rounded inline-block">
                                Campaign Phase: {o.startDate} to {o.endDate}
                              </p>
                            ) : (
                              <p className="text-[9.5px] italic text-stone-400">No specified duration limit (Always Active)</p>
                            )}
                            <p className="text-emerald-800 font-bold text-[11px] pt-1">Reward Offering: {o.perkName}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOfferIdx(idx);
                                setEditOfferVolumeSqYds(o.volumeSqYds || 0);
                                setEditOfferPaymentPercentage(o.paymentPercentage || 0);
                                setEditOfferPerkName(o.perkName || '');
                                setEditOfferStartDate(o.startDate || '');
                                setEditOfferEndDate(o.endDate || '');
                              }}
                              className="p-1.5 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 hover:text-emerald-700 rounded-lg text-stone-400 transition-all cursor-pointer"
                              title="Edit Offer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = specialMonthlyOffers.filter((_, i) => i !== idx);
                                setSpecialMonthlyOffers(updated);
                                saveFullConfig({ specialMonthlyOffers: updated });
                              }}
                              className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 hover:text-rose-600 rounded-lg text-stone-400 transition-all cursor-pointer shrink-0"
                              title="Delete Offer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline Add */}
                <div className="p-3 bg-stone-50/50 border border-dashed border-stone-200 rounded-xl space-y-2 flex flex-col font-sans">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      id="offer-volume"
                      placeholder="Volume (sq yd)"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400 font-sans"
                    />
                    <input
                      type="number"
                      id="offer-payment"
                      placeholder="Payment criteria %"
                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400 font-sans"
                    />
                  </div>
                  <input
                    type="text"
                    id="offer-perk"
                    placeholder="Offer Perk (e.g. Domestic holiday tour)"
                    className="px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none placeholder-stone-400 font-sans"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Start Date</span>
                      <input
                        type="date"
                        id="offer-start-date"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none font-sans font-medium"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Expiry Date</span>
                      <input
                        type="date"
                        id="offer-end-date"
                        className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none font-sans font-medium"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const volEl = document.getElementById('offer-volume') as HTMLInputElement;
                      const payEl = document.getElementById('offer-payment') as HTMLInputElement;
                      const perkEl = document.getElementById('offer-perk') as HTMLInputElement;
                      const startEl = document.getElementById('offer-start-date') as HTMLInputElement;
                      const endEl = document.getElementById('offer-end-date') as HTMLInputElement;
                      if (volEl && payEl && perkEl && volEl.value && payEl.value && perkEl.value) {
                        const updated = [
                          ...specialMonthlyOffers,
                          {
                            id: `smo-${Date.now()}`,
                            volumeSqYds: Number(volEl.value) || 0,
                            paymentPercentage: Number(payEl.value) || 0,
                            perkName: perkEl.value,
                            startDate: startEl && startEl.value ? startEl.value : undefined,
                            endDate: endEl && endEl.value ? endEl.value : undefined
                          }
                        ];
                        setSpecialMonthlyOffers(updated);
                        saveFullConfig({ specialMonthlyOffers: updated });
                        volEl.value = '';
                        payEl.value = '';
                        perkEl.value = '';
                        if (startEl) startEl.value = '';
                        if (endEl) endEl.value = '';
                      }
                    }}
                    className="w-full py-1.5 bg-stone-900 text-white rounded text-[10.5px] font-bold tracking-wider hover:bg-stone-800 transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                  >
                    <Plus className="w-3.5 h-3.5" /> Append Special Offer
                  </button>
                </div>
              </div>
            </div>

            {/* D. Terms and Conditions List Editor */}
            <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden font-sans">
              <div className="p-4 border-b border-stone-200 bg-stone-50/50 font-sans">
                <h3 className="font-bold text-stone-900 flex items-center gap-2 text-xs uppercase tracking-wide">
                  <ShieldAlert className="w-4 h-4 text-emerald-800" /> SBR Operations Terms & Conditions
                </h3>
                <p className="text-[9px] text-stone-500 font-sans">Global compliance clauses shown to all partners</p>
              </div>
              <div className="p-4 space-y-3.5">
                <div className="space-y-2">
                  {termsAndConditions.map((term, idx) => (
                    <div key={idx}>
                      {editingTermIdx === idx ? (
                        <div className="bg-emerald-50/45 border border-emerald-200 rounded-xl p-3 text-xs space-y-2 flex flex-col font-sans">
                          <span className="text-[9.5px] font-bold text-emerald-800 uppercase tracking-wide">Edit Compliance Rule</span>
                          <textarea
                            value={editTermText}
                            onChange={(e) => setEditTermText(e.target.value)}
                            rows={3}
                            className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-700 font-sans"
                          />
                          <div className="flex justify-end gap-1.5 pt-1 font-sans">
                            <button
                              type="button"
                              onClick={() => setEditingTermIdx(null)}
                              className="px-2.5 py-1 text-[10px] bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (editTermText.trim()) {
                                  const updated = [...termsAndConditions];
                                  updated[idx] = editTermText;
                                  setTermsAndConditions(updated);
                                  setEditingTermIdx(null);
                                  saveFullConfig({ termsAndConditions: updated });
                                }
                              }}
                              className="px-2.5 py-1 text-[10px] bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md transition-all cursor-pointer font-sans"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-start bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs gap-3">
                          <p className="text-stone-700 leading-relaxed text-[11px] font-sans flex-grow">
                            <span className="font-bold font-mono text-[10px] text-emerald-800 mr-1">#{idx + 1}</span>
                            {term}
                          </p>
                          <div className="flex gap-1 shrink-0 font-sans">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTermIdx(idx);
                                setEditTermText(term || '');
                              }}
                              className="p-1.5 hover:bg-emerald-50 border border-transparent hover:border-emerald-100 hover:text-emerald-700 rounded-lg text-stone-400 transition-all cursor-pointer font-sans"
                              title="Edit Compliance Rule"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = termsAndConditions.filter((_, i) => i !== idx);
                                setTermsAndConditions(updated);
                                saveFullConfig({ termsAndConditions: updated });
                              }}
                              className="p-1.5 hover:bg-rose-50 border border-transparent hover:border-rose-100 hover:text-rose-600 rounded-lg text-stone-400 transition-all cursor-pointer shrink-0 font-sans"
                              title="Delete Compliance Rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Inline Add */}
                <div className="p-3 bg-stone-50/50 border border-dashed border-stone-200 rounded-xl space-y-2 flex flex-col font-sans">
                  <textarea
                    id="new-term"
                    placeholder="Type global compliance term or SBR regulatory clause..."
                    rows={2}
                    className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded text-xs outline-none font-sans placeholder-stone-400"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const termEl = document.getElementById('new-term') as HTMLTextAreaElement;
                      if (termEl && termEl.value) {
                        const updated = [...termsAndConditions, termEl.value];
                        setTermsAndConditions(updated);
                        saveFullConfig({ termsAndConditions: updated });
                        termEl.value = '';
                      }
                    }}
                    className="w-full py-1.5 bg-stone-900 text-white rounded text-[10.5px] font-bold tracking-wider hover:bg-stone-800 transition-all flex items-center justify-center gap-1 cursor-pointer font-sans"
                  >
                    <Plus className="w-3.5 h-3.5" /> Append Compliance Rule
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 2. ONBOARD SPONSORS WITH DETAILED INFO */}
      {activeSubTab === 'AGENTS' && (
        <div className="space-y-6 animate-fade-in">
          <div id="sbr-edit-detail" className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden scroll-mt-24">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50">
              <h3 className="font-bold text-stone-900 flex items-center gap-2 text-sm uppercase tracking-wide">
                <PlusCircle className="w-5 h-5 text-emerald-800" /> Register Strategic Sponsoring Partner (SBR Series)
              </h3>
              <p className="text-xs text-stone-500 mt-1">
                Aadhaar card details, PAN card, and date of birth are standard regulatory mandatory fields to certify a sourcing partner under SBR Sponsors compensation guidelines.
              </p>
            </div>

            <form onSubmit={handleOnboardAgent} className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
              
              {/* PRIMARY BROKER CREDENTIALS */}
              <div className="space-y-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <h4 className="text-stone-800 font-bold text-xs uppercase tracking-wider border-b border-stone-200 pb-1 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-800" /> Primary Broker Credentials
                </h4>
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Full Representative Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Anand Satpute"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Email ID (Optional)</label>
                  <input
                    type="email"
                    placeholder="anand@sbrpartners.in"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Mobile Contact Phone</label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98450 11022"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Direct Recruiter / Sponsor</label>
                  <select
                    required
                    value={newSponsor}
                    onChange={(e) => setNewSponsor(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 cursor-pointer focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                  >
                    <option value="" disabled>Select Sponsor</option>
                    {users
                      .filter((u) => !['C', 'A1', 'A2'].includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.id}) - {u.designation || 'Associate'}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* SECURE IDENTITY INFORMATION SEC (PII) */}
              <div className="space-y-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <h4 className="text-stone-800 font-bold text-xs uppercase tracking-wider border-b border-stone-200 pb-1 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-emerald-800" /> Identity verification (PII)
                </h4>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Date of Birth (DOB)</label>
                  <input
                    type="date"
                    required
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Aadhaar Card (12-Digit)</label>
                  <input
                    type="text"
                    required
                    placeholder="xxxx-xxxx-xxxx"
                    value={newAadhar}
                    onChange={(e) => setNewAadhar(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">PAN Card Number (10 Alphanumeric)</label>
                  <input
                    type="text"
                    required
                    placeholder="ABCDE1234F"
                    value={newPan}
                    onChange={(e) => setNewPan(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none uppercase font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Father's / Husband's Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Satpute"
                    value={newFatherOrHusbandName}
                    onChange={(e) => setNewFatherOrHusbandName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Residential Address</label>
                  <textarea
                    rows={2}
                    placeholder="Flat 202, Heights Tower, Hyderabad 500032"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 outline-none resize-none"
                  />
                </div>
              </div>

              {/* BANK DETAILS SECTION */}
              <div className="space-y-4 bg-stone-50 p-4 rounded-xl border border-stone-200">
                <h4 className="text-stone-800 font-bold text-xs uppercase tracking-wider border-b border-stone-200 pb-1 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-emerald-800" /> Bank Details (Commission)
                </h4>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Bank Account Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 50200012345678"
                    value={newBankAccountNumber}
                    onChange={(e) => setNewBankAccountNumber(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">IFSC Code</label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC0001234"
                    value={newIfscCode}
                    onChange={(e) => setNewIfscCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Branch Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Gachibowli, Hyderabad"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Nominee Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Savita Satpute (Spouse)"
                    value={newNominee}
                    onChange={(e) => setNewNominee(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Nominee Relation</label>
                  <input
                    type="text"
                    placeholder="e.g. Spouse, Son, Mother"
                    value={newNomineeRelation}
                    onChange={(e) => setNewNomineeRelation(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-bold text-teal-400 uppercase block mb-1 font-mono tracking-widest">Initial Career Designation (Team Level)</label>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-1">
                  {(['Associate', 'Manager', 'Sr. Manager', 'AGM', 'GM', 'Sr. GM'] as User['designation'][]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setNewDesignation(d)}
                      className={`px-3 py-2 text-xs rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                        newDesignation === d
                          ? 'border-teal-500 bg-teal-500/10 text-teal-400 font-bold shadow-sm'
                          : 'border-white/10 bg-white/2 hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      <span>{d}</span>
                      {newDesignation === d && <Award className="w-3.5 h-3.5 text-teal-400 fill-teal-400" />}
                    </button>
                  ))}
                </div>
              </div>

              {createUserSuccess && (
                <div className="md:col-span-3 p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold">Sponsor Onboarded Successfully</h5>
                    <p className="mt-0.5 text-slate-300 font-mono text-[11px]">{createUserSuccess}</p>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div className="md:col-span-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  {errorMsg}
                </div>
              )}

              <div className="md:col-span-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="w-full bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg py-2.5 text-xs font-bold transition-all cursor-pointer shadow-xs uppercase tracking-wider font-sans disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmittingUser ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Cloud Database...</span>
                    </>
                  ) : (
                    <span>Confirm Sourcing Credential Allocation</span>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Sponsor Reference Code — admin's own onboarding ID, mirrors the AgentPanel card */}
          {currentUserAgentId && (
            <div id="sbr-sponsor-code" className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs scroll-mt-24">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block font-sans">Sponsor Reference Code</span>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed font-sans">
                Share this ID as the recruiting sponsor when onboarding new associates.
              </p>
              <div className="flex gap-2 mt-4 max-w-sm">
                <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 flex-grow font-mono font-bold text-sm text-emerald-800 flex items-center select-all">
                  {currentUserAgentId}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(currentUserAgentId);
                    setCopiedUserId('__SELF_CODE__');
                    setTimeout(() => setCopiedUserId(null), 2000);
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                    copiedUserId === '__SELF_CODE__'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-white text-stone-800 border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  {copiedUserId === '__SELF_CODE__' ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            </div>
          )}

          <div id="sbr-tree-section" className="scroll-mt-24">
            <TreeVisualizer
              users={users}
              onSelectUser={(id) => setSelectedTreeUserId(id)}
              selectedUserId={selectedTreeUserId}
            />
          </div>

          <div id="sbr-user-detail" className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden scroll-mt-24">
            <div className="p-4 border-b border-stone-200 bg-stone-50/50 flex items-center justify-between flex-col md:flex-row gap-4">
              <div>
                <h4 className="font-bold text-stone-900 text-xs uppercase font-sans">Live Sourcing Team Directory</h4>
                <p className="text-[10px] text-stone-500">Suspend sub-broker network portals instantly during audits.</p>
              </div>
              <div className="relative w-full md:w-64">
                <input
                  type="text"
                  placeholder="Search sub-brokers..."
                  value={agentFilter}
                  onChange={(e) => setAgentFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-full text-xs rounded-lg border border-stone-200 bg-white text-stone-900 outline-none"
                />
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-stone-400" />
              </div>
            </div>

            {/* Mobile: stacked partner cards (the 7-column table is unreadable <sm) */}
            <div className="sm:hidden divide-y divide-stone-200">
              {filteredAgents.map((agent) => (
                <div key={agent.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 text-sm truncate">{agent.name}</p>
                      <p className="text-[10px] text-stone-500 mt-0.5 truncate">{agent.email ? `${agent.email} • ` : ''}{agent.phone}</p>
                    </div>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                      agent.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-stone-100 text-stone-600 border-stone-200'
                    }`}>
                      {agent.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-bold text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">{agent.id}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">{agent.designation || 'Associate'}</span>
                    {agent.sponsorId ? (
                      <span className="text-[9px] font-mono bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded border border-stone-200">Spon: {agent.sponsorId}</span>
                    ) : (
                      <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.5 border border-amber-200 rounded">Independent Director</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] bg-stone-50 border border-stone-200 rounded-lg p-2.5">
                    <div>
                      <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Direct Sales</span>
                      <span className="font-mono font-bold text-stone-900">{formatPoints(agent.totalDirectSales)}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Downline</span>
                      <span className="font-mono font-bold text-stone-900">{formatPoints(agent.totalDownlineSales)}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Aadhaar</span>
                      <span className="font-mono text-stone-600">{agent.aadhar || '—'}</span>
                    </div>
                    <div>
                      <span className="text-stone-400 uppercase font-bold text-[8.5px] block">PAN</span>
                      <span className="font-mono uppercase text-stone-600">{agent.pan || '—'}</span>
                    </div>
                  </div>

                  {/* Actions: full-width tap targets in a 2-col grid */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {!isRestrictedForCurrentUser(agent.id) ? (
                      <>
                        <button
                          onClick={() => openCredentialsEditor(agent)}
                          className="flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-lg border border-stone-200 bg-white text-stone-700 active:bg-stone-100 cursor-pointer"
                        >
                          <Key className="w-3 h-3 text-stone-500" /> Credentials
                        </button>
                        <button
                          onClick={() => { window.location.hash = `/profile/${agent.id}`; }}
                          className="flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 active:bg-emerald-100 cursor-pointer"
                        >
                          <Users className="w-3 h-3" /> Profile
                        </button>
                        <button
                          onClick={() => copyInviteMessage(agent)}
                          className={`flex items-center justify-center gap-1 py-2 text-[11px] font-bold rounded-lg border cursor-pointer ${
                            copiedUserId === agent.id
                              ? 'bg-emerald-800 border-emerald-800 text-white'
                              : 'bg-white border-stone-200 text-stone-700 active:bg-stone-100'
                          }`}
                        >
                          <Share2 className="w-3 h-3" /> {copiedUserId === agent.id ? 'Copied ✓' : 'Invite'}
                        </button>
                      </>
                    ) : (
                      <span className="flex items-center justify-center py-2 text-[11px] bg-stone-50 text-stone-400 font-bold rounded-lg border border-stone-200 select-none">
                        🔒 Restricted
                      </span>
                    )}
                    <button
                      onClick={() => onToggleUserStatus(agent.id)}
                      className={`flex items-center justify-center py-2 text-[11px] font-bold rounded-lg border cursor-pointer ${
                        agent.status === 'ACTIVE'
                          ? 'bg-rose-50 border-rose-200 text-rose-800 active:bg-rose-100'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800 active:bg-emerald-100'
                      }`}
                    >
                      {agent.status === 'ACTIVE' ? 'Suspend' : 'Authorize'}
                    </button>
                    {!isAdminId(agent.id) && (
                      <button
                        onClick={() => confirmDeleteAgent(agent)}
                        className="col-span-2 flex items-center justify-center py-2 text-[11px] font-bold rounded-lg bg-rose-600 border border-rose-700 text-white active:bg-rose-700 cursor-pointer"
                      >
                        Delete Sponsor
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                    <th className="px-5 py-3 font-sans">Representative Partner</th>
                    <th className="px-5 py-3">SBR ID</th>
                    <th className="px-5 py-3 font-sans">Sub-Sponsor</th>
                    <th className="px-5 py-3">Aadhaar (PII)</th>
                    <th className="px-5 py-3">PAN card</th>
                    <th className="px-5 py-3 font-sans">Sales Volume</th>
                    <th className="px-5 py-3 text-right font-sans">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800">
                  {filteredAgents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-stone-50/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="font-sans">
                            <p className="font-bold text-stone-900 text-xs">{agent.name}</p>
                            <p className="text-[9.5px] text-stone-500 mt-0.5">{agent.email} • {agent.phone}</p>
                            <div className="flex gap-1.5 mt-1">
                              <span className="text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-stone-100 text-stone-800 border border-stone-200">{agent.designation || 'Associate'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-800">{agent.id}</td>
                      <td className="px-5 py-3">
                        {agent.sponsorId ? (
                          <span className="bg-stone-100 text-stone-700 text-[10px] px-1.5 py-0.5 rounded border border-stone-200 font-mono">
                            Spon: {agent.sponsorId}
                          </span>
                        ) : (
                          <span className="text-[9px] text-amber-800 bg-amber-50 px-1.5 py-0.2 border border-amber-200 rounded">
                            Independent Director
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-stone-600 font-mono">{agent.aadhar || 'xxxx-xxxx-xxxx'}</td>
                      <td className="px-5 py-3 text-stone-600 uppercase font-mono">{agent.pan || 'XXXXXXXXXX'}</td>
                      <td className="px-5 py-3">
                        <p className="font-bold text-stone-900 text-xs font-mono">{formatPoints(agent.totalDirectSales)}</p>
                        <p className="text-[9px] text-stone-500 mt-0.5 font-sans">Downline: {formatPoints(agent.totalDownlineSales)}</p>
                      </td>
                      <td className="px-5 py-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isRestrictedForCurrentUser(agent.id) ? (
                            <>
                              <button
                                onClick={() => openCredentialsEditor(agent)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-all cursor-pointer flex items-center gap-1"
                                title="Edit secure credentials"
                              >
                                <Key className="w-2.5 h-2.5 text-stone-500" />
                                <span>Credentials</span>
                              </button>

                              <button
                                onClick={() => { window.location.hash = `/profile/${agent.id}`; }}
                                className="text-[10px] font-bold px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer flex items-center gap-1"
                                title="Open full partner profile"
                              >
                                <Users className="w-2.5 h-2.5" />
                                <span>Profile</span>
                              </button>

                              {/* SMS button hidden until DLT registration is complete */}
                              {/*
                              <button
                                onClick={() => openSMSPortal(agent)}
                                className="text-[10px] font-bold px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer flex items-center gap-1"
                                title="Send SMS/Credentials"
                              >
                                <Smartphone className="w-2.5 h-2.5" />
                                <span>SMS</span>
                              </button>
                              */}

                              <button
                                onClick={() => copyInviteMessage(agent)}
                                className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-all cursor-pointer flex items-center gap-1 ${
                                  copiedUserId === agent.id
                                    ? 'bg-emerald-800 border-emerald-800 text-white'
                                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                                }`}
                                title="Copy Invitation Message"
                              >
                                <Share2 className="w-2.5 h-2.5" />
                                <span>{copiedUserId === agent.id ? 'Copied ✓' : 'Invite'}</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] bg-stone-50 text-stone-400 font-bold px-2 py-1 rounded border border-stone-200 select-none flex items-center gap-1">
                              🔒 Restricted
                            </span>
                          )}

                          <button
                            onClick={() => onToggleUserStatus(agent.id)}
                            className={`text-[10px] font-bold px-2.5 py-1 rounded transition-all cursor-pointer ${
                              agent.status === 'ACTIVE'
                                ? 'bg-rose-50 border border-rose-200 text-rose-800 hover:bg-rose-100'
                                : 'bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            {agent.status === 'ACTIVE' ? 'Suspend' : 'Authorize'}
                          </button>

                          {!isAdminId(agent.id) && (
                            <button
                              onClick={() => confirmDeleteAgent(agent)}
                              className="text-[10px] font-bold px-2.5 py-1 rounded bg-rose-600 border border-rose-700 text-white hover:bg-rose-700 transition-all cursor-pointer"
                              title="Permanently Delete Sponsor"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>


        </div>
      )}      {/* 3. SBR PROJECTS SETUP & METADATA */}
      {activeSubTab === 'PROJECTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          <div className="lg:col-span-5 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden h-fit">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50">
              <h3 className="font-bold text-stone-900 restored-text-color flex items-center gap-2 text-sm uppercase tracking-wide">
                <Home className="w-5 h-5 text-emerald-800" /> Upload SBR Real Estate Project
              </h3>
              <p className="text-xs text-stone-500 mt-1">Add Name, Location, Starting Prices, and customize villa/plot dimensions.</p>
            </div>

            <form onSubmit={handleAddNewProject} className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SBR Sponsors Meadows"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Site Location / Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Gachibowli Phase-II, Hyderabad, India"
                  value={projLocation}
                  onChange={(e) => setProjLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Starting Price per Sq Yd</label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      placeholder="e.g. 15000"
                      value={projStartingPrice}
                      onChange={(e) => setProjStartingPrice(Number(e.target.value) || 0)}
                      className="w-full pr-12 pl-3 py-2 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <span className="absolute right-2.5 top-2 py-0.5 px-1 bg-stone-100 border border-stone-200 text-stone-500 rounded text-[9px]">/Sq Yd</span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Project Layout Map</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Map Image URL..."
                      value={projMapUrl}
                      onChange={(e) => setProjMapUrl(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-2 text-[11px] rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                    />
                    <label className="px-2.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-lg text-[10.5px] cursor-pointer border border-stone-200 shrink-0 transition-all flex items-center justify-center">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) {
                                setProjMapUrl(event.target.result as string);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* SBR Project Smart Metadata Fields */}
              <div className="space-y-3 border-t border-stone-200 pt-3">
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">
                  SBR Project Registration & Legal Metadata
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-stone-50/50 p-3 rounded-xl border border-stone-200">
                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Project Stage</label>
                    <select
                      value={projProjectStage}
                      onChange={(e) => setProjProjectStage(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                    >
                      <option value="Pre-Launch">Pre-Launch</option>
                      <option value="Under Construction">Under Construction</option>
                      <option value="Near Possession">Near Possession</option>
                      <option value="Launched / Ready to Move">Launched / Ready to Move</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Sub-Registrar Office (SRO)</label>
                    <input
                      type="text"
                      list="sro-suggestions"
                      placeholder="e.g. Gurgaon, Sohna"
                      value={projSroOffice}
                      onChange={(e) => setProjSroOffice(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <datalist id="sro-suggestions">
                      <option value="Gurgaon" />
                      <option value="Sohna" />
                      <option value="Wazirabad" />
                      <option value="Indri" />
                      <option value="Nuh" />
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Registry Status</label>
                    <select
                      value={projRegistryStatus}
                      onChange={(e) => setProjRegistryStatus(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                    >
                      <option value="Not Started">Not Started</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Registry Date</label>
                    <input
                      type="date"
                      value={projRegistryDate}
                      onChange={(e) => setProjRegistryDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Mutation Status</label>
                    <select
                      value={projMutationStatus}
                      onChange={(e) => setProjMutationStatus(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Applied">Applied</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Mutation Date</label>
                    <input
                      type="date"
                      value={projMutationDate}
                      onChange={(e) => setProjMutationDate(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[9px] font-bold text-stone-500 uppercase block mb-1">Mutation Number (Intakal No.)</label>
                    <input
                      type="text"
                      placeholder="e.g. Intakal 4567-B"
                      value={projMutationNumber}
                      onChange={(e) => setProjMutationNumber(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Size Slabs Input list */}
              <div className="space-y-3.5 border-t border-stone-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide block">Inventory Slabs / Sizing Ranges</span>
                  <button
                    type="button"
                    onClick={addSizeTierRow}
                    className="text-[9.5px] font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 cursor-pointer"
                  >
                    + Add Inventory Row
                  </button>
                </div>

                <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                  {sizeTiersInput.map((tier, idx) => (
                    <div key={idx} className="bg-stone-50 p-2.5 border border-stone-200 rounded-lg space-y-2 relative">
                      <button
                        type="button"
                        onClick={() => removeSizeTierRow(idx)}
                        className="absolute top-1.5 right-2 text-stone-400 hover:text-rose-600 text-[9.5px] font-bold cursor-pointer"
                        title="Delete category tier"
                      >
                        ✕ Remove
                      </button>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-5">
                          <label className="text-[8.5px] font-bold text-stone-500 uppercase block mb-0.5">Unit Number(s) / Range</label>
                          <input
                            type="text"
                            required
                            value={tier.unitsRaw}
                            onChange={(e) => handleSizeTierChange(idx, 'unitsRaw', e.target.value)}
                            placeholder="e.g. 1-20 or Villa-101"
                            className="w-full px-2 py-1 text-[10.5px] rounded border border-stone-200 bg-white text-stone-900 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[8.5px] font-bold text-stone-500 uppercase block mb-0.5">Size (Sq Yd)</label>
                          <input
                            type="number"
                            required
                            value={tier.size}
                            onChange={(e) => handleSizeTierChange(idx, 'size', e.target.value)}
                            placeholder="e.g. 100"
                            className="w-full px-2 py-1 text-[10.5px] font-bold rounded border border-stone-200 bg-white text-stone-900 focus:outline-none font-mono"
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="text-[8.5px] font-bold text-stone-500 uppercase block mb-0.5">Unit Type</label>
                          <select
                            value={tier.type || 'Residential'}
                            onChange={(e) => handleSizeTierChange(idx, 'type', e.target.value)}
                            className="w-full px-2 py-1 text-[10.5px] rounded border border-stone-200 bg-white text-stone-900 focus:outline-none cursor-pointer"
                          >
                            <option value="Residential">Residential</option>
                            <option value="Commercial">Commercial</option>
                            <option value="Villa">Villa</option>
                            <option value="Plot">Plot</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {projSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  {projSuccess}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg py-2.5 text-xs font-bold transition-all cursor-pointer shadow-xs uppercase tracking-wide"
              >
                Launch SBR Project Metadata
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-stone-200 p-5">
              <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide">Live SBR Site Layout Catalogs</h3>
              <p className="text-xs text-stone-500 mt-1">Preview of active building projects, launching maps, and unit capacity calculations.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((proj) => {
                const totalUnits = proj.inventory.reduce((acc, cat) => acc + cat.units.length, 0);
                const holdUnits = proj.inventory.reduce(
                  (acc, cat) => acc + cat.units.filter(u => u.status === 'HOLD').length, 0
                );
                const bookedUnits = proj.inventory.reduce(
                  (acc, cat) => acc + cat.units.filter(u => u.status === 'BOOKED').length, 0
                );
                const availableUnits = totalUnits - holdUnits - bookedUnits;

                return (
                  <div key={proj.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden flex flex-col justify-between shadow-xs">
                    <div className="relative group cursor-zoom-in overflow-hidden border-b border-stone-200">
                      <img 
                        src={proj.imageMapUrl || 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=350'} 
                        alt={proj.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-36 object-cover bg-stone-100 transition-transform duration-350 group-hover:scale-105"
                        onError={(e) => {
                          e.currentTarget.src = 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=600';
                        }}
                      />
                      <div 
                        onClick={() => {
                          setZoomedMap({ 
                            url: proj.imageMapUrl || 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=800', 
                            title: proj.name 
                          });
                          setZoomScale(1);
                        }}
                        className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5"
                      >
                        <ZoomIn className="w-4 h-4 text-white shrink-0" />
                        <span>Zoom Layout Map</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                            {proj.id}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono font-semibold">{formatINR(proj.sqYardStartingPrice)} / Sq Yard</span>
                        </div>
                        <h4 className="font-bold text-stone-900 text-xs mt-1">{proj.name}</h4>
                        <p className="text-[10px] text-stone-500">{proj.location}</p>
                      </div>

                      <div className="grid grid-cols-4 gap-1 text-center border-t border-stone-200 pt-3">
                        <div className="bg-stone-50 p-1.5 rounded">
                          <p className="text-[11.5px] font-mono font-bold text-stone-800">{totalUnits}</p>
                          <p className="text-[8.5px] text-stone-500 uppercase mt-0.5">Total</p>
                        </div>
                        <div className="bg-emerald-50 p-1.5 rounded border border-emerald-200">
                          <p className="text-[11.5px] font-mono font-bold text-emerald-800">{availableUnits}</p>
                          <p className="text-[8.5px] text-emerald-600 uppercase mt-0.5">Avail</p>
                        </div>
                        <div className="bg-amber-50 p-1.5 rounded border border-amber-200">
                          <p className="text-[11.5px] font-mono font-bold text-amber-800">{holdUnits}</p>
                          <p className="text-[8.5px] text-amber-600 uppercase mt-0.5">Hold</p>
                        </div>
                        <div className="bg-rose-50 p-1.5 rounded border border-rose-200">
                          <p className="text-[11.5px] font-mono font-bold text-rose-800">{bookedUnits}</p>
                          <p className="text-[8.5px] text-rose-600 uppercase mt-0.5">Book</p>
                        </div>
                      </div>

                      {/* SBR Project Legal & Milestones Metadata details */}
                      <div className="border-t border-stone-200 pt-2.5 space-y-2">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-stone-500 font-medium">Project Stage:</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            proj.projectStage === 'Launched / Ready to Move' 
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                              : proj.projectStage === 'Near Possession'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : proj.projectStage === 'Under Construction'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200 animate-pulse'
                              : 'bg-stone-100 text-stone-800 border border-stone-200'
                          }`}>
                            {proj.projectStage || 'Pre-Launch'}
                          </span>
                        </div>

                        <div className="bg-stone-50/70 rounded-lg p-2 border border-stone-200/70 space-y-1 text-[10px]">
                          <div className="flex justify-between items-center border-b border-stone-100 pb-1 mb-1">
                            <span className="font-bold text-stone-600 uppercase text-[8px] tracking-wider">Registry</span>
                            <span className={`px-1 rounded-sm text-[8px] font-bold ${
                              proj.registryStatus === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : proj.registryStatus === 'In Progress'
                                ? 'bg-amber-100 text-amber-800'
                                : proj.registryStatus === 'On Hold'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-stone-200 text-stone-600'
                            }`}>
                              {proj.registryStatus || 'Not Started'}
                            </span>
                          </div>
                          {(proj.registryDate || proj.sroOffice) ? (
                            <div className="grid grid-cols-2 gap-1 text-[9px] text-stone-600">
                              {proj.registryDate && (
                                <div>
                                  <span className="text-stone-400">Date:</span> <span className="font-mono font-semibold">{proj.registryDate}</span>
                                </div>
                              )}
                              {proj.sroOffice && (
                                <div className="text-right">
                                  <span className="text-stone-400">SRO:</span> <span className="font-bold text-emerald-800">{proj.sroOffice}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[8.5px] text-stone-400 italic">No registration office or deed date recorded.</div>
                          )}
                        </div>

                        <div className="bg-stone-50/70 rounded-lg p-2 border border-stone-200/70 space-y-1 text-[10px]">
                          <div className="flex justify-between items-center border-b border-stone-100 pb-1 mb-1">
                            <span className="font-bold text-stone-600 uppercase text-[8px] tracking-wider">Mutation (Intakal)</span>
                            <span className={`px-1 rounded-sm text-[8px] font-bold ${
                              proj.mutationStatus === 'Approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : proj.mutationStatus === 'Applied'
                                ? 'bg-amber-100 text-amber-800'
                                : proj.mutationStatus === 'Rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-stone-200 text-stone-600'
                            }`}>
                              {proj.mutationStatus || 'Pending'}
                            </span>
                          </div>
                          {(proj.mutationDate || proj.mutationNumber) ? (
                            <div className="grid grid-cols-2 gap-1 text-[9px] text-stone-600">
                              {proj.mutationDate && (
                                <div>
                                  <span className="text-stone-400">Date:</span> <span className="font-mono font-semibold">{proj.mutationDate}</span>
                                </div>
                              )}
                              {proj.mutationNumber && (
                                <div className="text-right">
                                  <span className="text-stone-400">No:</span> <span className="font-mono font-bold text-stone-700">{proj.mutationNumber}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-[8.5px] text-stone-400 italic">No mutation record or sanction date.</div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-stone-200 pt-2 flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingProject(proj)}
                          className="w-full text-center py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          Update Legal Metadata & Stage 📝
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedProjUnitsId(expandedProjUnitsId === proj.id ? null : proj.id)}
                          className="w-full text-center py-1.2 bg-stone-100 hover:bg-stone-200/80 text-stone-700 hover:text-stone-900 rounded-lg text-[9.5px] font-semibold transition-all flex items-center justify-center gap-1 cursor-pointer"
                        >
                          {expandedProjUnitsId === proj.id ? 'Hide Unit Directory ✕' : 'View Unit Directory Capacity 🔍'}
                        </button>
                        
                        {expandedProjUnitsId === proj.id && (
                          <div className="mt-1 border border-stone-200 rounded-xl bg-stone-50/50 p-2 max-h-56 overflow-y-auto custom-scrollbar space-y-2">
                            <div className="text-[9.5px] font-bold text-stone-500 uppercase flex justify-between px-1">
                              <span>Unit ID / Type</span>
                              <span>Status</span>
                            </div>
                            <div className="space-y-1">
                              {proj.inventory.flatMap(cat => 
                                cat.units.map(u => ({ ...u, size: cat.size }))
                              ).map((u, ui) => (
                                <div key={ui} className="flex justify-between items-center text-[10px] bg-white p-1.5 rounded border border-stone-200 shadow-xxs">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-stone-800">{u.unitNumber}</span>
                                    <span className="text-[8px] text-stone-500 font-medium font-sans">
                                      {u.size} • {u.type || 'Residential'}
                                    </span>
                                  </div>
                                  <span className={`px-1.5 py-0.5 rounded-md font-bold text-[8.5px] uppercase ${
                                    u.status === 'BOOKED' 
                                      ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                                      : u.status === 'HOLD'
                                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  }`}>
                                    {u.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4. BOOK PLOT/VILLA INVENTORY */}
      {activeSubTab === 'BOOKINGS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          <div className="lg:col-span-6 bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden h-fit">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50">
              <h3 className="font-bold text-stone-900 restored-text-color flex items-center gap-2 text-sm uppercase tracking-wide">
                <Layers className="w-5 h-5 text-emerald-800" /> Book Inventory & Allocate Overrides
              </h3>
              <p className="text-xs text-stone-500 mt-1">Admin registers a sales agreement. Compiles exact overrides and pays down lines instantly.</p>
            </div>

            <form onSubmit={handleBookInventorySubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">1. Select SBR Project</label>
                  <select
                    required
                    value={bookProjId}
                    onChange={(e) => {
                      setBookProjId(e.target.value);
                      setBookSizeCategory('');
                      setBookUnitNumber('');
                      setSelectedUnits([]);
                    }}
                    className="w-full px-2 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  >
                    <option value="">-- Choose Project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">2. Plot Size</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomSize(!isCustomSize);
                        setBookSizeCategory('');
                        setSelectedUnits([]);
                      }}
                      className="text-[9px] text-emerald-800 font-bold hover:underline cursor-pointer"
                    >
                      {isCustomSize ? 'Select Preset Size' : 'Enter Custom Size'}
                    </button>
                  </div>
                  {isCustomSize ? (
                    <input
                      type="text"
                      required
                      placeholder="e.g. 180 Sq Yards"
                      value={bookSizeCategory}
                      onChange={(e) => {
                        setBookSizeCategory(e.target.value);
                        setSelectedUnits([]);
                      }}
                      className="w-full px-2.5 py-1.8 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  ) : (
                    <select
                      required
                      disabled={!bookProjId}
                      value={bookSizeCategory}
                      onChange={(e) => {
                        setBookSizeCategory(e.target.value);
                        setSelectedUnits([]);
                      }}
                      className="w-full px-2 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    >
                      <option value="">-- Choose Size --</option>
                      {selectedProjObject?.inventory.map((inv, idx) => (
                        <option key={idx} value={inv.size}>{inv.size}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                    3. Select available unit(s) (Multi-select)
                  </label>
                  {unitsToBook.length === 0 ? (
                    <div className="text-xs text-stone-400 italic p-3 bg-stone-50 rounded-lg border border-stone-200">
                      {bookProjId ? "No available units found for the selected size." : "Select a project first."}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-stone-500/5 border border-stone-200 rounded-lg">
                      {unitsToBook.map((u) => {
                        const isSelected = selectedUnits.includes(u.unitNumber);
                        return (
                          <button
                            key={u.unitNumber}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedUnits(selectedUnits.filter(x => x !== u.unitNumber));
                              } else {
                                setSelectedUnits([...selectedUnits, u.unitNumber]);
                              }
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-800 text-white border-emerald-900 shadow-sm'
                                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                            }`}
                          >
                            {u.unitNumber}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedUnits.length > 0 && (
                    <div className="text-[10.5px] text-stone-600 font-sans mt-1.5">
                      Selected ({selectedUnits.length}): <strong className="text-emerald-800">{selectedUnits.join(', ')}</strong>
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                    4. Commission Recipient (Channel Partner)
                  </label>
                  <select
                    required
                    value={bookAgentId}
                    onChange={(e) => setBookAgentId(e.target.value)}
                    className="w-full px-2 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none font-sans font-bold cursor-pointer"
                  >
                    <option value="">-- Choose Representative --</option>
                    {users.filter(u => u.status === 'ACTIVE').map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.id}) • {u.designation || 'Associate'}</option>
                    ))}
                  </select>
                </div>

              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Buyer / Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mrs. Sarita Reddy"
                  value={bookBuyerName}
                  onChange={(e) => setBookBuyerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>

              {/* ADMIN-ONLY BOOKING CONFIGURATIONS */}
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl space-y-3.5">
                <div className="flex items-center gap-1.5 border-b border-amber-500/10 pb-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <h4 className="text-[10px] font-bold text-amber-800 uppercase tracking-wider font-sans">👑 Admin-Only Booking Parameters</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Rate per Sq Yard (INR)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 15000"
                        value={bookRatePerSqYard}
                        onChange={(e) => setBookRatePerSqYard(e.target.value)}
                        className="w-full pr-12 pl-3 py-1.8 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      />
                      <span className="absolute right-3 top-2 text-[10px] text-stone-500 font-bold font-sans">₹/YD</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Token Booking Amount (INR)</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="e.g. 75000"
                        value={bookingFormTokenAmount}
                        onChange={(e) => setBookingFormTokenAmount(e.target.value)}
                        className="w-full pr-12 pl-3 py-1.8 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      />
                      <span className="absolute right-3 top-2 text-[10px] text-stone-500 font-bold font-sans">₹ (INR)</span>
                    </div>
                  </div>
                </div>
                
                {bookSizeCategory && (
                  <div className="text-[9.5px] text-stone-500 font-medium">
                    Formula: <span className="font-semibold text-stone-700">Plot Size ({parseFloat(bookSizeCategory.replace(/[^\d.]/g, '')) || 0} Sq Yd)</span> points value = <span className="font-semibold text-stone-700">{calculatePointsFromSize(parseFloat(bookSizeCategory.replace(/[^\d.]/g, '')) || 0)} PTS</span> per unit. Total Units = <span className="font-semibold text-stone-700">{selectedUnits.length || 1}</span>. Converting to points: <span className="font-bold text-emerald-800">{bookSaleValue || '0'} PTS</span>. Total Sale Value (INR) = <span className="font-bold text-stone-700">{formatINR((parseFloat(bookSizeCategory.replace(/[^\d.]/g, '')) || 0) * (selectedUnits.length || 1) * (parseFloat(bookRatePerSqYard) || 15000))}</span>.
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Actual Sale Value (Points)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      placeholder="e.g. 3.0"
                      value={bookSaleValue}
                      onChange={(e) => setBookSaleValue(e.target.value)}
                      className="w-full pr-12 pl-3 py-2 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-stone-500 font-bold font-sans">PTS</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Bank Clearance Reference #</label>
                  <input
                    type="text"
                    placeholder="e.g. TXN-IND-908123"
                    value={bookRefNumber}
                    onChange={(e) => setBookRefNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Booking Agreement Status</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-stone-700 font-bold cursor-pointer">
                    <input
                      type="radio"
                      name="bookStatus"
                      checked={bookStatus === 'BOOKED'}
                      onChange={() => setBookStatus('BOOKED')}
                    />
                    Locked Booking (BOOKED status)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-stone-700 font-bold cursor-pointer">
                    <input
                      type="radio"
                      name="bookStatus"
                      checked={bookStatus === 'HOLD'}
                      onChange={() => setBookStatus('HOLD')}
                    />
                    Temporary Hold allotment (HOLD status)
                  </label>
                </div>
              </div>

              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 space-y-3">
                <label className="text-[10px] font-bold text-stone-500 uppercase block font-sans">Milestone Tracking Status</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingFormStatus('TOKEN_RECEIVED')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      bookingFormStatus === 'TOKEN_RECEIVED'
                        ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Token received
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingFormStatus('BOOKING_DONE')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      bookingFormStatus === 'BOOKING_DONE'
                        ? 'bg-blue-100 bg-opacity-80 text-blue-900 border-blue-300 shadow-xs'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Booking Done (30%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookingFormStatus('REGISTRY_DONE')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer text-center ${
                      bookingFormStatus === 'REGISTRY_DONE'
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    Registry Done (100%)
                  </button>
                </div>

                {bookingFormStatus === 'TOKEN_RECEIVED' && (
                  <div className="pt-2 border-t border-stone-200/60 animate-fade-in">
                    <label className="text-[9.5px] font-bold text-stone-500 uppercase block mb-1">Specify Token Payment Received (Points)</label>
                    <div className="relative max-w-[150px]">
                      <input
                        type="number"
                        step="any"
                        placeholder="e.g. 0.15"
                        value={bookingFormTokenAmount}
                        onChange={(e) => setBookingFormTokenAmount(e.target.value)}
                        className="w-full pr-12 pl-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      />
                      <span className="absolute right-2.5 top-2 text-[10px] text-stone-500 font-bold">PTS</span>
                    </div>
                  </div>
                )}
              </div>

              {bookingSuccess && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-800 shrink-0" />
                  {bookingSuccess}
                </div>
              )}

              {bookingError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                  {bookingError}
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg py-2.8 text-xs font-bold transition-all cursor-pointer shadow uppercase tracking-wider"
              >
                Launch Booking Agreement Clearances & overrides
              </button>
            </form>
          </div>

          <div id="sbr-inventory-section" className="lg:col-span-6 bg-white rounded-2xl border border-stone-200 p-5 space-y-4 shadow-xs scroll-mt-24">
            <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide">Real Estate Inventory Table (Live status)</h3>
            <p className="text-xs text-stone-500">View real-time booking statuses of every SBR project unit categorized by size.</p>

            <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
              {projects.map((p) => (
                <div key={p.id} className="border border-stone-200 bg-stone-50/50 rounded-xl p-3.5 space-y-3">
                  <div className="flex justify-between items-center border-b border-stone-200 pb-1.5">
                    <h4 className="font-bold text-stone-900 text-xs">{p.name}</h4>
                    <span className="text-[10px] text-stone-500 font-sans font-bold uppercase">{p.location}</span>
                  </div>

                  {p.inventory.map((inv, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <span className="text-[10.5px] font-bold text-stone-600 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-800" /> Size slab: {inv.size}
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {inv.units.map((u, uIdx) => (
                          <span
                            key={uIdx}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold font-mono border flex flex-col items-center select-none ${
                              u.status === 'BOOKED'
                                ? 'bg-rose-50 border-rose-200 text-rose-800'
                                : u.status === 'HOLD'
                                ? 'bg-amber-50 border-amber-200 text-amber-800'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            }`}
                          >
                            <span>{u.unitNumber}</span>
                            <span className="text-[8px] opacity-75 mt-0.5 lowercase font-sans">
                              {u.status === 'BOOKED' ? u.buyerName || 'booked' : u.status}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. CORPORATE SALES LEDGER */}
      {activeSubTab === 'SALES' && (
        <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden animate-fade-in">
          <div className="p-5 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center flex-col md:flex-row gap-4">
            <div>
              <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide">SBR Corporate Sales Ledger</h3>
              <p className="text-xs text-stone-500 mt-1">Audit and record trail of properties sold. Calculates commission distributions up the sourcing network.</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 font-bold text-[10.5px] rounded px-3 py-1.5 text-emerald-800 font-sans">
              Total Booking Value processed: {formatPoints(totalSalesVal)}
            </div>
          </div>

          {/* Mobile: one card per booking with the same controls as the table row */}
          <div className="sm:hidden divide-y divide-stone-200">
            {sales.map((sale) => (
              <div key={sale.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-stone-900 text-sm truncate">{sale.project} · <span className="text-emerald-800">{sale.unitNumber}</span></p>
                    <p className="text-[10px] text-stone-500 font-mono mt-0.5">{sale.id} · {sale.sizeSqYards} SQ YD</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[9px] uppercase font-bold rounded px-1.5 py-0.5 border shrink-0 ${
                    sale.status === 'HOLD'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    {sale.status === 'HOLD' ? 'HOLD' : 'CONFIRMED'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] bg-stone-50 border border-stone-200 rounded-lg p-2.5">
                  <div>
                    <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Buyer</span>
                    <span className="font-bold text-stone-800">{sale.buyerName}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Broker</span>
                    <span className="font-bold text-stone-800">{sale.agentName}</span>
                    <span className="font-mono text-stone-500 block text-[9px]">{sale.agentId}</span>
                  </div>
                  {/* Derived, not the raw stored saleValue — that field holds
                      rupees on seeded/imported rows, so rendering it as PTS made
                      this card disagree with the desktop table for the same sale. */}
                  <div>
                    <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Total Points</span>
                    <span className="font-mono font-bold text-emerald-800">{formatPoints(getSalePoints(sale))}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 uppercase font-bold text-[8.5px] block">Agreement Price</span>
                    <span className="font-mono font-bold text-stone-900">{formatINR(getSaleAgreementValueINR(sale))}</span>
                  </div>
                </div>

                {renderPaymentProgress(sale)}
                <button
                  onClick={() => openPaymentsLedger(sale.id)}
                  className="w-full py-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 active:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                >
                  💳 Manage Payments ({getSalePayments(sale).length})
                </button>

                <div className="space-y-1.5">
                  <select
                    value={sale.bookingStatus || 'TOKEN_RECEIVED'}
                    onChange={(e) => {
                      if (onUpdateSaleBookingStatus) {
                        const newStatus = e.target.value as 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE';
                        const currentAmt = sale.tokenAmount !== undefined ? sale.tokenAmount : 75000;
                        onUpdateSaleBookingStatus(sale.id, newStatus, currentAmt);
                      }
                    }}
                    className={`w-full text-[11px] font-bold px-2 py-2 rounded-lg border focus:outline-none cursor-pointer ${
                      sale.bookingStatus === 'REGISTRY_DONE'
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : sale.bookingStatus === 'BOOKING_DONE'
                        ? 'bg-blue-50 text-blue-900 border-blue-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}
                  >
                    <option value="TOKEN_RECEIVED">Token Received</option>
                    <option value="BOOKING_DONE">Booking Done (30% paid)</option>
                    <option value="REGISTRY_DONE">Registry Done (100% paid)</option>
                  </select>

                  {(sale.bookingStatus || 'TOKEN_RECEIVED') === 'TOKEN_RECEIVED' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-stone-500 whitespace-nowrap">Token Amt:</span>
                      <input
                        type="number"
                        step="any"
                        value={sale.tokenAmount !== undefined ? sale.tokenAmount : 75000}
                        onChange={(e) => {
                          if (onUpdateSaleBookingStatus && e.target.value !== '') {
                            onUpdateSaleBookingStatus(sale.id, 'TOKEN_RECEIVED', parseFloat(e.target.value));
                          }
                        }}
                        className="flex-1 px-2 py-1.5 text-[11px] font-mono font-bold bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        title="Edit token amount in INR"
                      />
                      <span className="text-[9px] text-stone-500 font-bold">INR</span>
                    </div>
                  ) : (
                    <p className="text-[10px] text-stone-500 italic">
                      {sale.bookingStatus === 'REGISTRY_DONE' ? '100% fully paid' : '30% paid done'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                  <th className="px-5 py-3">Booking ID</th>
                  <th className="px-5 py-3">SBR Layout & Villa #</th>
                  <th className="px-5 py-3">Acquirer Representative</th>
                  <th className="px-5 py-3">Broker Sourced</th>
                  <th className="px-5 py-3">Size dimension</th>
                  <th className="px-5 py-3 font-mono">Total Points</th>
                  <th className="px-5 py-3 font-mono">Agreement Price (INR)</th>
                  <th className="px-5 py-3">Payment Health (INR)</th>
                  <th className="px-5 py-3">Allotment State</th>
                  <th className="px-5 py-3">Milestone Booking Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-stone-800">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-stone-50/30 transition-colors">
                    <td className="px-5 py-3.5 font-bold font-mono text-stone-900">{sale.id}</td>
                    <td className="px-5 py-3.5 font-sans">
                      <p className="font-bold text-stone-900 text-xs">{sale.project}</p>
                      <p className="text-[10px] text-emerald-800 mt-0.5 font-semibold">{sale.unitNumber}</p>
                    </td>
                    <td className="px-5 py-3.5 text-stone-700 font-bold">{sale.buyerName}</td>
                    <td className="px-5 py-3.5 font-sans">
                      <p className="font-bold text-stone-900">{sale.agentName}</p>
                      <p className="text-[9.5px] text-stone-500 mt-0.5 font-mono">{sale.agentId}</p>
                    </td>
                    <td className="px-5 py-3.5 text-stone-600 font-mono">{sale.sizeSqYards} SQ YD</td>
                    <td className="px-5 py-3.5 font-bold text-emerald-800 text-xs font-mono">{formatPoints(getSalePoints(sale))}</td>
                    <td className="px-5 py-3.5 font-bold text-stone-900 text-xs font-mono">{formatINR(getSaleAgreementValueINR(sale))}</td>
                    <td className="px-5 py-3.5">
                      {renderPaymentProgress(sale)}
                      <button
                        onClick={() => openPaymentsLedger(sale.id)}
                        className="mt-1.5 flex items-center gap-1 px-2.5 py-1 text-[10.5px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer transition-all w-full justify-center shadow-2xs"
                      >
                        💳 Manage Payments ({getSalePayments(sale).length})
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase rounded px-1.5 py-0.5 border ${
                        sale.status === 'HOLD'
                          ? 'bg-amber-50 text-amber-800 border-amber-200 py-0.5'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200 py-0.5'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${sale.status === 'HOLD' ? 'bg-amber-600' : 'bg-emerald-600'}`} />
                        {sale.status === 'HOLD' ? 'HOLD' : 'CONFIRMED'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1.5 max-w-[170px]">
                        <select
                          value={sale.bookingStatus || 'TOKEN_RECEIVED'}
                          onChange={(e) => {
                            if (onUpdateSaleBookingStatus) {
                              const newStatus = e.target.value as 'TOKEN_RECEIVED' | 'BOOKING_DONE' | 'REGISTRY_DONE';
                              const currentAmt = sale.tokenAmount !== undefined ? sale.tokenAmount : 75000;
                              onUpdateSaleBookingStatus(sale.id, newStatus, currentAmt);
                            }
                          }}
                          className={`text-[11px] font-bold px-2 py-1 rounded border focus:outline-none cursor-pointer ${
                            sale.bookingStatus === 'REGISTRY_DONE'
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : sale.bookingStatus === 'BOOKING_DONE'
                              ? 'bg-blue-50 text-blue-900 border-blue-200'
                              : 'bg-amber-50 text-amber-900 border-amber-200'
                          }`}
                        >
                          <option value="TOKEN_RECEIVED">Token Received</option>
                          <option value="BOOKING_DONE">Booking Done (30% paid)</option>
                          <option value="REGISTRY_DONE">Registry Done (100% paid)</option>
                        </select>

                        {(sale.bookingStatus || 'TOKEN_RECEIVED') === 'TOKEN_RECEIVED' ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-stone-500 whitespace-nowrap">Token Amt:</span>
                            <input
                              type="number"
                              step="any"
                              value={sale.tokenAmount !== undefined ? sale.tokenAmount : 75000}
                              onChange={(e) => {
                                if (onUpdateSaleBookingStatus && e.target.value !== '') {
                                  onUpdateSaleBookingStatus(
                                    sale.id,
                                    'TOKEN_RECEIVED',
                                    parseFloat(e.target.value)
                                  );
                                }
                              }}
                              className="w-20 px-1 py-0.5 text-[10px] font-mono font-bold bg-white border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-700"
                              title="Edit token amount in INR"
                            />
                            <span className="text-[9px] text-stone-500 font-bold font-sans">INR</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-stone-500 italic px-0.5">
                            {sale.bookingStatus === 'REGISTRY_DONE' ? '100% fully paid' : '30% paid done'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. OPERATIONS & PAYOUTS AUDITING — shared desk, also served at /payouts */}
      {activeSubTab === 'PAYOUTS' && (
        <div id="sbr-payouts-section" className="space-y-6 animate-fade-in scroll-mt-24">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center flex-col md:flex-row gap-4">
              <div>
                <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide">SBR Operations Audit & Commission Desk</h3>
                <p className="text-xs text-stone-500 mt-1">Track computed override lines, hold payouts for compliance, or dispatch verified bank disbursements.</p>
              </div>
            </div>

            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                    <th className="px-4 py-3">Payout / Sale ID</th>
                    <th className="px-4 py-3">Payee Name / ID</th>
                    <th className="px-4 py-3">Network Level</th>
                    <th className="px-4 py-3 font-mono text-center">Comm %</th>
                    <th className="px-4 py-3 font-mono">Gross Commission (₹)</th>
                    <th className="px-4 py-3 font-mono">TDS 5% (₹)</th>
                    <th className="px-4 py-3 font-mono">Flat Admin Fee (₹)</th>
                    <th className="px-4 py-3 font-mono">Net Release (₹)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Auditing Clearances</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800">
                  {payouts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-5 py-10 text-center text-stone-400 font-medium font-sans">
                        No commission disbursements recorded yet. Create a plot booking first.
                      </td>
                    </tr>
                  ) : (
                    payouts.map((pay) => (
                      <tr key={pay.id} className="hover:bg-stone-50/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <p className="font-bold font-mono text-stone-900">{pay.id}</p>
                          <p className="text-[9.5px] font-mono text-stone-500">{pay.saleId} ({pay.unitNumber})</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-stone-900">{pay.agentName}</p>
                          <p className="text-[9.5px] text-stone-500 mt-0.5 font-mono">{pay.agentId}</p>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-stone-700">Level {pay.level}</td>
                        <td className="px-4 py-3.5 font-mono text-center font-bold text-stone-700">{pay.percentage}%</td>
                        <td className="px-4 py-3.5 font-mono text-stone-900 font-bold">{formatINR(pay.grossCommission)}</td>
                        <td className="px-4 py-3.5 font-mono text-rose-600">-{formatINR(pay.tdsDeduction)}</td>
                        <td className="px-4 py-3.5 font-mono text-stone-500">-{formatINR(pay.adminFee)}</td>
                        <td className="px-4 py-3.5 font-bold text-emerald-800 font-mono text-sm">{formatINR(pay.netCommission)}</td>
                        <td className="px-4 py-3.5">
                          <select
                            value={pay.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as 'PENDING' | 'APPROVED' | 'DISBURSED';
                              if (onUpdatePayoutStatus) {
                                onUpdatePayoutStatus(pay.id, newStatus);
                              } else if (newStatus === 'APPROVED') {
                                onApprovePayout(pay.id);
                              } else if (newStatus === 'DISBURSED') {
                                onDisbursePayout(pay.id);
                              }
                            }}
                            className={`text-xs font-bold rounded-lg border px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer shadow-2xs transition-all ${
                              pay.status === 'PENDING'
                                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                                : pay.status === 'APPROVED'
                                ? 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                            }`}
                          >
                            <option value="PENDING" className="bg-white text-amber-900 font-bold">PENDING</option>
                            <option value="APPROVED" className="bg-white text-blue-900 font-bold">APPROVED</option>
                            <option value="DISBURSED" className="bg-white text-emerald-900 font-bold">DISBURSED</option>
                          </select>
                        </td>
                        <td className="px-4 py-3.5 text-right font-sans">
                          <span className={`text-[11px] font-bold ${
                            pay.status === 'PENDING' 
                              ? 'text-amber-700' 
                              : pay.status === 'APPROVED' 
                              ? 'text-blue-700' 
                              : 'text-emerald-700 font-mono'
                          }`}>
                            {pay.status === 'PENDING' 
                              ? 'Awaiting Sanction' 
                              : pay.status === 'APPROVED' 
                              ? 'Sanctioned for RTGS' 
                              : 'Cleared Bank Transfer'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 7. DAILY USER LIFECYCLE AUDIT LOGS */}
      {activeSubTab === 'LOGS' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary metrics cards for logs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Total Recorded Lifecycle Events</span>
              <h3 className="text-xl sm:text-2xl font-bold font-mono text-emerald-800 mt-1">
                {userLogs.length}
              </h3>
              <p className="text-[9.5px] text-stone-500 mt-2">
                User onboarding and deletions audit trail
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block font-sans text-green-700">Total User Additions</span>
              <h3 className="text-xl sm:text-2xl font-bold font-mono text-green-800 mt-1">
                {userLogs.filter(l => l.action === 'ADDITION').length}
              </h3>
              <p className="text-[9.5px] text-stone-500 mt-2">
                New sub-brokers registered in system
              </p>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block font-sans text-rose-700">Total User Deletions</span>
              <h3 className="text-xl sm:text-2xl font-bold font-mono text-rose-800 mt-1">
                {userLogs.filter(l => l.action === 'DELETION').length}
              </h3>
              <p className="text-[9.5px] text-stone-500 mt-2">
                Accounts purged and downlines reparented
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-stone-200 bg-stone-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-stone-900 text-sm uppercase tracking-wide flex items-center gap-2">
                  🛡️ SBR Daily Lifecycle Audit Ledger
                </h3>
                <p className="text-xs text-stone-500 mt-1">Official security log tracking personnel additions and hierarchy modifications.</p>
              </div>
              <button
                type="button"
                onClick={handleExportLogsCSV}
                className="px-3.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all font-sans uppercase tracking-wider"
              >
                <Download className="w-3.5 h-3.5" /> Export Logs to CSV
              </button>
            </div>

            {/* Mobile: compact log entries */}
            <div className="sm:hidden divide-y divide-stone-200">
              {userLogs.length === 0 ? (
                <p className="px-5 py-10 text-center text-stone-400 text-xs font-medium">
                  No user lifecycle activities have been logged yet today.
                </p>
              ) : (
                userLogs.map((log) => (
                  <div key={log.id} className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase rounded-full px-2 py-0.5 border ${
                        log.action === 'ADDITION'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {log.action}
                      </span>
                      <span className="font-mono text-[9.5px] text-stone-400">
                        {new Date(log.timestamp).toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-stone-900">
                      {log.userName} <span className="font-mono font-normal text-stone-500">({log.userId})</span>
                    </p>
                    <p className="text-[10px] text-stone-500">
                      Sponsor: <span className="font-mono">{log.sponsorId || '—'}</span> · By {log.performedBy}
                    </p>
                    <p className="text-[10.5px] text-stone-600 leading-snug">{log.details}</p>
                  </div>
                ))
              )}
            </div>

            <div className="hidden sm:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Action</th>
                    <th className="px-5 py-3">Subject ID</th>
                    <th className="px-5 py-3">Subject Name</th>
                    <th className="px-5 py-3">Sponsor ID</th>
                    <th className="px-5 py-3">Performed By</th>
                    <th className="px-5 py-3">System Log Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 text-stone-800 font-sans">
                  {userLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-stone-400 font-medium font-sans">
                        No user lifecycle activities have been logged yet today.
                      </td>
                    </tr>
                  ) : (
                    userLogs.map((log) => {
                      const formattedTime = new Date(log.timestamp).toLocaleString('en-IN', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                      });
                      return (
                        <tr key={log.id} className="hover:bg-stone-50/30 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-stone-500 whitespace-nowrap text-[11px]">{formattedTime}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold uppercase rounded-full px-2.5 py-0.5 border ${
                              log.action === 'ADDITION'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              <span className={`w-1 h-1 rounded-full ${
                                log.action === 'ADDITION' ? 'bg-green-500' : 'bg-rose-500'
                              }`} />
                              {log.action}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-mono font-bold text-stone-900 text-[11px]">{log.userId}</td>
                          <td className="px-5 py-3.5 font-bold text-stone-800">{log.userName}</td>
                          <td className="px-5 py-3.5 font-mono text-stone-500 text-[11px]">{log.sponsorId}</td>
                          <td className="px-5 py-3.5 text-stone-700 font-medium whitespace-nowrap">{log.performedBy}</td>
                          <td className="px-5 py-3.5 text-stone-600 leading-relaxed text-[11px] max-w-[320px] truncate" title={log.details}>
                            {log.details}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Payment Records & Installment Management Modal */}
      {selectedPaymentSaleId && (() => {
        const sale = sales.find(s => s.id === selectedPaymentSaleId);
        if (!sale) return null;
        
        const payments = getSalePayments(sale);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalValue = getSaleTotalAgreementValueINR(sale);
        const pending = totalValue - totalPaid;
        const pct = totalValue > 0 ? (totalPaid / totalValue) * 100 : 0;
        
        return (
          <div className="fixed inset-0 bg-stone-900/45 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl border border-stone-200 max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col shadow-xl">
              {/* Modal Header */}
              <div className="p-5 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center">
                <div>
                  <h4 className="font-extrabold text-stone-900 text-sm uppercase tracking-wider flex items-center gap-2">
                    💳 Payment Installments & Ledger
                  </h4>
                  <p className="text-[11px] text-stone-500 mt-0.5 font-sans">
                    Manage payment installments, check transaction status, and add new payment events for Booking ID: <span className="font-mono font-bold text-stone-800">{sale.id}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPaymentSaleId(null)}
                  className="text-stone-400 hover:text-stone-700 text-sm font-bold cursor-pointer font-mono"
                >
                  [ Close ESC ]
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6 flex-1 font-sans">
                {/* Real estate context summary banner */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-stone-50 border border-stone-200 p-4 rounded-xl">
                  <div>
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5 font-sans">SBR Layout Unit</p>
                    <p className="font-bold text-stone-900 text-xs">{sale.project}</p>
                    <p className="text-[11px] text-emerald-800 font-bold">{sale.unitNumber}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5 font-sans">Buyer Client</p>
                    <p className="font-bold text-stone-900 text-xs">{sale.buyerName}</p>
                    <p className="text-[10px] text-stone-500 font-mono">Ref: {sale.referenceNumber}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5 font-sans">Sourcing Broker</p>
                    <p className="font-bold text-stone-900 text-xs">{sale.agentName}</p>
                    <p className="text-[10px] text-stone-500 font-mono">ID: {sale.agentId}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5 font-sans">Points (From Size)</p>
                    <p className="font-extrabold text-emerald-800 font-mono text-sm">{formatPoints(getSalePoints(sale))}</p>
                    <p className="text-[10px] text-stone-600 font-mono font-bold mt-0.5">{formatINR(getSaleAgreementValueINR(sale))} ({sale.sizeSqYards} SQ YD)</p>
                  </div>
                </div>

                {/* Overall Financial Progress Card */}
                <div className="bg-emerald-50/10 border border-emerald-200 p-4 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                      Installment Progress Tracker
                    </span>
                    <span className="text-xs font-black text-emerald-800 font-mono">
                      {pct.toFixed(2)}% Paid
                    </span>
                  </div>
                  
                  <div className="w-full bg-stone-200 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        pct >= 100 
                          ? 'bg-emerald-600' 
                          : pct >= 30 
                          ? 'bg-blue-600' 
                          : 'bg-amber-600'
                      }`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center pt-2">
                    <div className="border-r border-stone-200">
                      <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mb-0.5">Total Sale Value (INR)</p>
                      <p className="font-extrabold text-stone-900 text-xs font-mono">{formatINR(totalValue)}</p>
                    </div>
                    <div className="border-r border-stone-200">
                      <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-widest mb-0.5">Total Amount Paid (INR)</p>
                      <p className="font-extrabold text-emerald-800 text-xs font-mono">{formatINR(totalPaid)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-amber-700 uppercase tracking-widest mb-0.5">Pending Balance (INR)</p>
                      <p className={`font-extrabold text-xs font-mono ${pending > 0 ? 'text-amber-800 font-bold' : 'text-emerald-800 font-bold'}`}>
                        {pending > 0 ? formatINR(pending) : 'Fully Paid'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Side: Ledger / Installment History (7 cols) */}
                  <div className="lg:col-span-7 space-y-3">
                    <h5 className="font-bold text-stone-900 text-xs uppercase tracking-wider flex items-center gap-1">
                      📋 Receipt Records History ({payments.length})
                    </h5>

                    <div className="border border-stone-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-200 text-[9px] uppercase font-bold text-stone-500 tracking-wider">
                            <th className="px-3 py-2">Receipt Date</th>
                            <th className="px-3 py-2">Mode</th>
                            <th className="px-3 py-2 text-right">Amount Received</th>
                            <th className="px-3 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200">
                          {payments.map((p) => (
                            <tr key={p.id} className="hover:bg-stone-50/50">
                              <td className="px-3 py-2.5 font-mono text-stone-500 text-[11px] whitespace-nowrap">
                                {p.date}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="inline-block text-[9.5px] font-semibold font-sans text-stone-700">
                                  {p.paymentMode.replace('_', ' ')}
                                </span>
                                {p.reference && (
                                  <p className="text-[9px] text-stone-400 font-mono mt-0.5 truncate max-w-[120px]" title={p.reference}>
                                    Ref: {p.reference}
                                  </p>
                                )}
                                {p.notes && (
                                  <p className="text-[9px] text-stone-400 italic mt-0.5 truncate max-w-[120px]" title={p.notes}>
                                    "{p.notes}"
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-bold font-mono text-stone-900 text-xs">
                                {formatINR(p.amount)}
                              </td>
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <div className="inline-flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleEditPaymentClick(p)}
                                    className="text-blue-700 hover:text-blue-900 font-bold text-[10.5px] cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  {payments.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm("Are you sure you want to delete this payment record?")) {
                                          handleDeletePayment(p.id);
                                        }
                                      }}
                                      className="text-rose-700 hover:text-rose-900 font-bold text-[10.5px] cursor-pointer"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right Side: Add / Edit Receipt Entry Form (5 cols) */}
                  <div className="lg:col-span-5 bg-stone-50 border border-stone-200 rounded-xl p-4.5 space-y-3.5 h-fit">
                    <h5 className="font-bold text-stone-900 text-xs uppercase tracking-wider">
                      {paymentFormId ? '📝 Edit Receipt Entry' : '➕ Add Installment Receipt'}
                    </h5>

                    <form onSubmit={handleAddOrUpdatePayment} className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                          Amount Received (INR) *
                        </label>
                        <input
                          type="number"
                          step="any"
                          required
                          min="1"
                          placeholder="e.g. 75000"
                          value={paymentFormAmount}
                          onChange={(e) => setPaymentFormAmount(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                            Receipt Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={paymentFormDate}
                            onChange={(e) => setPaymentFormDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-sans rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                            Payment Mode
                          </label>
                          <select
                            value={paymentFormMode}
                            onChange={(e) => setPaymentFormMode(e.target.value as any)}
                            className="w-full px-2 py-1.5 text-xs font-sans rounded-lg border border-stone-200 bg-white text-stone-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-700"
                          >
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CHEQUE">Cheque</option>
                            <option value="CASH">Cash</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                          Transaction Reference / Instrument #
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. TXN-90123491823"
                          value={paymentFormReference}
                          onChange={(e) => setPaymentFormReference(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                          Internal Notes / Remarks
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Specify receipts, cleared status, or remarks..."
                          value={paymentFormNotes}
                          onChange={(e) => setPaymentFormNotes(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-sans rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                        />
                      </div>

                      <div className="flex gap-2 pt-1">
                        {paymentFormId && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentFormId(null);
                              setPaymentFormAmount('');
                              setPaymentFormDate(new Date().toISOString().split('T')[0]);
                              setPaymentFormMode('BANK_TRANSFER');
                              setPaymentFormReference('');
                              setPaymentFormNotes('');
                            }}
                            className="flex-1 px-3 py-2 bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-lg text-xs font-bold transition-all cursor-pointer text-center"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-1 px-3 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs text-center"
                        >
                          {paymentFormId ? 'Update Receipt' : 'Record Receipt'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 border-t border-stone-200 bg-stone-50/50 flex justify-end items-center">
                <button
                  onClick={() => setSelectedPaymentSaleId(null)}
                  className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                >
                  Close Ledger View
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit SBR Project Metadata Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="w-4.5 h-4.5 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-xs">Update SBR Project Stage & Legal Metadata</h4>
                  <p className="text-[9px] text-stone-300">Project: {editingProject.name} ({editingProject.id})</p>
                </div>
              </div>
              <button
                onClick={() => setEditingProject(null)}
                className="text-stone-300 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProjectMetadata} className="p-5 space-y-4 font-sans max-h-[80vh] overflow-y-auto">
              <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 text-emerald-800 text-[10.5px] leading-relaxed mb-2">
                <strong>Legal Compliance & Stage Tracking:</strong> Keeping SRO registers, Mutation dates, and Project stage status up-to-date helps brokers and partners close deals more efficiently.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Project Stage</label>
                  <select
                    value={editingProject.projectStage || 'Pre-Launch'}
                    onChange={(e) => setEditingProject({ ...editingProject, projectStage: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                  >
                    <option value="Pre-Launch">Pre-Launch</option>
                    <option value="Under Construction">Under Construction</option>
                    <option value="Near Possession">Near Possession</option>
                    <option value="Launched / Ready to Move">Launched / Ready to Move</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Sub-Registrar Office (SRO)</label>
                  <input
                    type="text"
                    list="edit-sro-suggestions"
                    placeholder="e.g. Gurgaon, Sohna, Wazirabad"
                    value={editingProject.sroOffice || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, sroOffice: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700"
                  />
                  <datalist id="edit-sro-suggestions">
                    <option value="Gurgaon" />
                    <option value="Sohna" />
                    <option value="Wazirabad" />
                    <option value="Indri" />
                    <option value="Nuh" />
                  </datalist>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Registry Status</label>
                  <select
                    value={editingProject.registryStatus || 'Not Started'}
                    onChange={(e) => setEditingProject({ ...editingProject, registryStatus: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Registry Date</label>
                  <input
                    type="date"
                    value={editingProject.registryDate || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, registryDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Mutation Status</label>
                  <select
                    value={editingProject.mutationStatus || 'Pending'}
                    onChange={(e) => setEditingProject({ ...editingProject, mutationStatus: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 cursor-pointer"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Applied">Applied</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Mutation Date (Sanction Date)</label>
                  <input
                    type="date"
                    value={editingProject.mutationDate || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, mutationDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Mutation Number (Intakal Number)</label>
                  <input
                    type="text"
                    placeholder="e.g. Intakal 8921/A"
                    value={editingProject.mutationNumber || ''}
                    onChange={(e) => setEditingProject({ ...editingProject, mutationNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-700 font-mono"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-stone-200 mt-4 justify-end">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-lg cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg cursor-pointer transition-all shadow-xs"
                >
                  Save Metadata Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Broker Credentials Modal */}
      {selectedAgentForPassword && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-stone-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-gradient-to-br from-stone-900 to-stone-950 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-xs">Edit Primary Broker Credentials</h4>
                  <p className="text-[9px] text-stone-300">Sponsor ID: {selectedAgentForPassword.id}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedAgentForPassword(null);
                  setPasswordStatusMsg('');
                }}
                className="text-stone-300 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 font-sans max-h-[80vh] overflow-y-auto">
              {isRestrictedForCurrentUser(selectedAgentForPassword.id) ? (
                <div className="text-center p-6 bg-rose-50 border border-rose-100 rounded-2xl text-stone-700">
                  <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto mb-2 font-serif" />
                  <p className="font-bold text-xs uppercase tracking-wider text-rose-900 font-sans">Access Restricted</p>
                  <p className="text-[10px] text-stone-600 mt-2 leading-relaxed">
                    You are not authorized to view, access, or update the credentials or secure passcode of other SBR administrator nodes.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelectedAgentForPassword(null)}
                    className="mt-4 w-full py-1.5 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Full Representative Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Enter full name"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Email Address (Optional)</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="name@email.com"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Contact Phone</label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Enter phone number"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={editDob}
                        onChange={(e) => setEditDob(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">PAN Card Number</label>
                      <input
                        type="text"
                        value={editPan}
                        onChange={(e) => setEditPan(e.target.value.toUpperCase())}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none font-mono"
                        placeholder="ABCDE1234F"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Father's / Husband's Name</label>
                      <input
                        type="text"
                        value={editFatherOrHusbandName}
                        onChange={(e) => setEditFatherOrHusbandName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Father's or Husband's Name"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Aadhaar Card Number</label>
                      <input
                        type="text"
                        value={editAadhar}
                        onChange={(e) => setEditAadhar(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none font-mono"
                        placeholder="12-digit Aadhaar"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Complete Residential Address</label>
                      <textarea
                        rows={2}
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none resize-none"
                        placeholder="Enter residential address"
                      />
                    </div>

                    <div className="sm:col-span-2 border-t border-stone-200 pt-2.5 mt-1">
                      <h5 className="font-bold text-stone-700 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-emerald-800" /> Bank Account Details (Commission)
                      </h5>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Bank Account Number</label>
                      <input
                        type="text"
                        value={editBankAccountNumber}
                        onChange={(e) => setEditBankAccountNumber(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none font-mono"
                        placeholder="Enter account number"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">IFSC Code</label>
                      <input
                        type="text"
                        value={editIfscCode}
                        onChange={(e) => setEditIfscCode(e.target.value.toUpperCase())}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none font-mono uppercase"
                        placeholder="IFSC Code"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Branch Name</label>
                      <input
                        type="text"
                        value={editBranchName}
                        onChange={(e) => setEditBranchName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Enter branch name"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Nominee</label>
                      <input
                        type="text"
                        value={editNominee}
                        onChange={(e) => setEditNominee(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Nominee name"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">Nominee Relation</label>
                      <input
                        type="text"
                        value={editNomineeRelation}
                        onChange={(e) => setEditNomineeRelation(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none"
                        placeholder="Nominee relation"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-bold text-stone-600 uppercase block mb-1">Secure Passcode / Password</label>
                      <input
                        type="text"
                        placeholder="Enter secure passcode"
                        value={tempPassword}
                        onChange={(e) => setTempPassword(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:ring-1 focus:ring-emerald-700 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {passwordStatusMsg && (
                    <p className="text-[10.5px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center animate-pulse font-sans">
                      {passwordStatusMsg}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentForPassword(null);
                        setPasswordStatusMsg('');
                      }}
                      className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 cursor-pointer font-sans"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={updatingPassword || !tempPassword.trim() || !editName.trim()}
                      onClick={async () => {
                        if (!tempPassword.trim() || !editName.trim()) return;
                        setUpdatingPassword(true);
                        setPasswordStatusMsg('');
                        try {
                          if (onUpdateUserProfile) {
                            await onUpdateUserProfile(selectedAgentForPassword.id, {
                              name: editName,
                              email: editEmail,
                              phone: editPhone,
                              dob: editDob,
                              aadhar: editAadhar,
                              pan: editPan,
                              address: editAddress,
                              fatherOrHusbandName: editFatherOrHusbandName,
                              password: tempPassword,
                              bankAccountNumber: editBankAccountNumber,
                              ifscCode: editIfscCode,
                              branchName: editBranchName,
                              nominee: editNominee,
                              nomineeRelation: editNomineeRelation,
                            });
                            setPasswordStatusMsg('Broker credentials updated successfully!');
                            setTimeout(() => {
                              setSelectedAgentForPassword(null);
                              setPasswordStatusMsg('');
                            }, 1200);
                          } else {
                            setPasswordStatusMsg('Callback not provided.');
                          }
                        } catch (err: any) {
                          setPasswordStatusMsg(err?.message || 'Failed to update credentials.');
                        } finally {
                          setUpdatingPassword(false);
                        }
                      }}
                      className="flex-1 py-1.5 text-xs font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer disabled:opacity-50 font-sans"
                    >
                      {updatingPassword ? 'Saving...' : 'Save Credentials'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SBR SMS Dispatch Portal Modal */}
      {selectedAgentForSMS && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider">SBR SMS Dispatch Portal</h4>
                  <p className="text-[9px] text-emerald-200/80">Sponsor/Agent ID: {selectedAgentForSMS.id}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedAgentForSMS(null);
                  setSmsSuccessStatus('IDLE');
                }}
                className="text-white hover:text-stone-200 text-xs font-bold transition-all p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 font-sans">
              
              {/* Recipient Details Card */}
              <div className="grid grid-cols-2 gap-3 bg-stone-50 p-3.5 rounded-xl border border-stone-200 text-[11px]">
                <div>
                  <p className="text-[8.5px] font-bold text-stone-400 uppercase tracking-widest">Recipient Partner</p>
                  <p className="font-bold text-stone-900 mt-0.5">{selectedAgentForSMS.name}</p>
                  <p className="text-stone-500 text-[10px]">{selectedAgentForSMS.designation || 'Associate'}</p>
                </div>
                <div>
                  <p className="text-[8.5px] font-bold text-stone-400 uppercase tracking-widest">Mobile Number</p>
                  <p className="font-bold text-stone-900 mt-0.5 font-mono">{selectedAgentForSMS.phone}</p>
                  <p className="text-stone-500 text-[10px]">{selectedAgentForSMS.email}</p>
                </div>
              </div>

              {/* Message Editor */}
              <div className="space-y-1">
                <label className="text-[9.5px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                  Message Content (Editable)
                </label>
                <textarea
                  rows={5}
                  value={smsMessageText}
                  onChange={(e) => setSmsMessageText(e.target.value)}
                  className="w-full px-3 py-2 text-[11.5px] rounded-lg border border-stone-200 bg-white text-stone-800 outline-none focus:ring-1 focus:ring-emerald-700 font-sans leading-relaxed custom-scrollbar"
                  placeholder="Type your message credentials..."
                />
              </div>

              {/* Status Box */}
              {smsSuccessStatus === 'SENDING' && (
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-center gap-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 text-emerald-800 animate-spin" />
                  <span className="text-[10.5px] font-semibold text-stone-700 font-sans">Connecting to SMS Gateway API...</span>
                </div>
              )}

              {smsSuccessStatus === 'SENT' && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-[10.5px] font-semibold flex items-start gap-2 animate-fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Dispatch Successful</p>
                    <p className="text-stone-600 font-normal mt-0.5 text-[9.5px]">
                      Message queued & broadcasted. Transaction Ref ID: <span className="font-mono font-bold">SBR-SMS-TXN-{Math.floor(100000 + Math.random() * 900000)}</span>.
                    </p>
                  </div>
                </div>
              )}

              {smsSuccessStatus === 'FAILED' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[10.5px] font-semibold flex items-start gap-2 animate-fade-in">
                  <ShieldAlert className="shrink-0 mt-0.5 w-4 h-4 text-rose-600" />
                  <div>
                    <p className="font-bold">Dispatch Failed</p>
                    <p className="text-stone-600 font-normal mt-0.5 text-[9.5px] leading-relaxed">
                      {smsErrorMessage || 'An unexpected error occurred while sending the SMS.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Channels Group */}
              <div className="space-y-2">
                <p className="text-[9.5px] font-bold text-stone-500 uppercase tracking-widest block mb-1">
                  Select Dispatch Channel
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      setSmsSuccessStatus('SENDING');
                      setIsSendingSMS(true);
                      setSmsErrorMessage('');
                      try {
                        const response = await fetch('/api/send-sms', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            phone: selectedAgentForSMS.phone,
                            message: smsMessageText,
                          }),
                        });

                        let data;
                        const contentType = response.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) {
                          data = await response.json();
                        } else {
                          const text = await response.text();
                          const snippet = text.length > 80 ? text.substring(0, 80) + '...' : text;
                          throw new Error(`Server returned non-JSON response (${response.status}). Note: Static hosting like GitHub Pages does not support backend APIs. Response: ${snippet}`);
                        }

                        if (response.ok && data.success) {
                          setSmsSuccessStatus('SENT');
                        } else {
                          setSmsSuccessStatus('FAILED');
                          setSmsErrorMessage(data.error || 'Server rejected SMS request.');
                        }
                      } catch (err: any) {
                        setSmsSuccessStatus('FAILED');
                        setSmsErrorMessage(err?.message || 'Network error connecting to SMS Gateway.');
                      } finally {
                        setIsSendingSMS(false);
                      }
                    }}
                    disabled={isSendingSMS}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 text-[10.5px] font-bold rounded-lg bg-emerald-800 text-white hover:bg-emerald-900 transition-all cursor-pointer disabled:opacity-50 font-sans uppercase tracking-wider"
                    title="Send real SMS via backend gateway (Fast2SMS or Twilio)"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingSMS ? 'Dispatching...' : 'Send SMS API'}</span>
                  </button>

                  <button
                    onClick={() => {
                      const cleanPhone = selectedAgentForSMS.phone.replace(/[^0-9]/g, '');
                      const waPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
                      const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(smsMessageText)}`;
                      window.open(waUrl, '_blank');
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 text-[10.5px] font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-all cursor-pointer font-sans uppercase tracking-wider"
                    title="Open in WhatsApp Web / App"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    onClick={() => {
                      const smsUri = `sms:${selectedAgentForSMS.phone}?body=${encodeURIComponent(smsMessageText)}`;
                      window.open(smsUri, '_blank');
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 text-[10.5px] font-bold rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 transition-all cursor-pointer font-sans uppercase tracking-wider"
                    title="Open default SMS app on your phone"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-stone-500" />
                    <span>Native SMS</span>
                  </button>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(smsMessageText);
                      const oldStatus = smsSuccessStatus;
                      setSmsSuccessStatus('SENT');
                      setTimeout(() => setSmsSuccessStatus(oldStatus), 2000);
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 text-[10.5px] font-bold rounded-lg border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-all cursor-pointer font-sans uppercase tracking-wider"
                    title="Copy message text to clipboard"
                  >
                    <Share2 className="w-3.5 h-3.5 text-stone-500" />
                    <span>Copy Text</span>
                  </button>
                </div>
              </div>

              {/* Footer Dismiss Button */}
              <div className="pt-2 border-t border-stone-200 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAgentForSMS(null);
                    setSmsSuccessStatus('IDLE');
                  }}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 cursor-pointer font-sans"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Zoomable Map Image Lightbox Modal */}
      {zoomedMap && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-stone-900 text-stone-100 rounded-2xl max-w-4xl w-full border border-stone-800 shadow-2xl overflow-hidden flex flex-col h-[85vh]">
            {/* Header */}
            <div className="bg-stone-950 p-4 border-b border-stone-800 flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-xs text-white uppercase tracking-wider">Project Layout Map Zoom</h4>
                <p className="text-[10px] text-stone-400 mt-0.5">{zoomedMap.title}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-stone-800 px-2.5 py-1 rounded-lg flex items-center gap-2 border border-stone-700">
                  <button 
                    type="button"
                    onClick={() => setZoomScale(prev => Math.max(0.5, prev - 0.25))}
                    className="p-1 hover:bg-stone-700 rounded text-stone-300 hover:text-white transition-all cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-stone-200 min-w-[40px] text-center font-bold">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button 
                    type="button"
                    onClick={() => setZoomScale(prev => Math.min(4, prev + 0.25))}
                    className="p-1 hover:bg-stone-700 rounded text-stone-300 hover:text-white transition-all cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="px-1.5 py-0.5 bg-stone-700 hover:bg-stone-700 rounded text-[9px] font-bold text-stone-300 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setZoomedMap(null);
                    setZoomScale(1);
                  }}
                  className="p-1.5 bg-stone-800 hover:bg-rose-950 hover:text-rose-400 border border-stone-700 rounded-lg text-stone-300 transition-all cursor-pointer text-xs"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Map Body: Zoom and Scrollable area */}
            <div className="flex-1 bg-stone-950 overflow-auto flex items-center justify-center p-6 relative cursor-grab active:cursor-grabbing">
              <div className="transition-all duration-150 ease-out" style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}>
                <img 
                  src={zoomedMap.url} 
                  alt={zoomedMap.title}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] max-w-full rounded-lg shadow-xl object-contain"
                  onError={(e) => {
                    e.currentTarget.src = 'https://images.unsplash.com/photo-1524813686514-a57563d77d61?auto=format&fit=crop&q=80&w=800';
                  }}
                />
              </div>
            </div>

            {/* Instruction Footer */}
            <div className="bg-stone-950 p-2 text-center text-[9px] text-stone-500 border-t border-stone-800">
              Use the + and - buttons to adjust map scale. Drag or scroll to navigate large project layouts.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
