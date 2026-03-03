import React from 'react';
import gsap from 'gsap';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    Calendar,
    Users,
    Settings2,
    LogOut,
    Shield,
    BarChart2,
    ChevronRight,
    Eye,
    EyeOff,
    Pen,
    FileText,
    X,
    ChevronLeft,
    AlertTriangle,
} from 'lucide-react';
import { useUIStore } from '../../lib/store/useUIStore';
import { GsapPremiumText } from '../animations/GsapPremiumText';
import { GsapMagnetic } from '../animations/GsapMagnetic';
import { GsapScrollReveal } from '../animations/GsapScrollReveal';
import { GsapPresence } from '../animations/GsapPresence';
import { apiFetch, setWorkspaceId } from '../../lib/workspaceApi';
import { registerGsapPlugins, withGsapContext } from '../../lib/motion/gsapRuntime';
import { canAnimate } from '../../lib/motion/motionPolicy';
import { ambientFloat } from '../../lib/motion/presets';
import { useMotionTier } from '../../lib/motion/useMotionTier';
import changelogMarkdown from '../../../CHANGELOG.md?raw';
import { parseReleaseNotes } from '../../features/changelog/changelogParser';
import { getGradientRecipe } from '../../styles/gradient-tokens';
import { useThemeStore } from '../../lib/store/useThemeStore';
import { featureFlags } from '../../config/flags';
import { setAuthToken, unlockWorkspace } from '../../api/client';
import MobileTopHeader from '../mobile/MobileTopHeader';
import FloatingToolDock, { type MobileDockAction, type MobileDockState } from '../mobile/FloatingToolDock';

interface WorkspaceOption {
    id: string;
    name: string;
    timezone: string;
}

export default function AppLayout() {
    const {
        viewMode,
        setViewMode,
        isAuthenticated,
        setIsAuthenticated,
        isEditor,
        setIsEditor,
        selectedWorkspaceId,
        setSelectedWorkspaceId,
        isPreviewReadonly,
        previewMessage,
        setPreviewStatus,
        isMobileDockCollapsed,
        setIsMobileDockCollapsed,
        setMobileActivePanel,
    } = useUIStore();
    // Subscribe to ensure theme store hydrates and applies data-theme on mount
    useThemeStore();
    const [workspaces, setWorkspaces] = React.useState<WorkspaceOption[]>([]);
    const [previewBannerDismissed, setPreviewBannerDismissed] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return sessionStorage.getItem('wayne_preview_banner_dismissed') === '1';
    });

    // Landing page state
    const [showPasswordModal, setShowPasswordModal] = React.useState(false);
    const [passwordInput, setPasswordInput] = React.useState('');
    const [showPassword, setShowPassword] = React.useState(false);
    const [loginError, setLoginError] = React.useState(false);
    const [showChangelogPopup, setShowChangelogPopup] = React.useState(false);
    const [showPasswordSettings, setShowPasswordSettings] = React.useState(false);
    const [currentPasswordInput, setCurrentPasswordInput] = React.useState('');
    const [newPasswordInput, setNewPasswordInput] = React.useState('');
    const [confirmPasswordInput, setConfirmPasswordInput] = React.useState('');
    const [changePasswordError, setChangePasswordError] = React.useState('');
    const [changePasswordSuccess, setChangePasswordSuccess] = React.useState('');
    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const loginRootRef = React.useRef<HTMLDivElement>(null);
    const tier = useMotionTier();
    const releaseNotes = React.useMemo(() => parseReleaseNotes(changelogMarkdown), []);
    const latestRelease = releaseNotes[0];
    const latestVersion = latestRelease?.version ?? 'v5.1';
    const loginBg = getGradientRecipe('login', 'page-bg');
    const loginHero = getGradientRecipe('login', 'hero-bg');
    const shellBg = getGradientRecipe('shell', 'page-bg');
    const sidebarBg = getGradientRecipe('shell', 'sidebar-bg');
    const sidebarActive = getGradientRecipe('shell', 'sidebar-active');
    const sidebarIcon = getGradientRecipe('shell', 'sidebar-icon');
    const popupHighlights = React.useMemo(() => {
        if (!latestRelease) return [];
        const source = latestRelease.highlights.length > 0 ? latestRelease.highlights : latestRelease.bullets;
        return source.slice(0, 3);
    }, [latestRelease]);

    const getStoredPassword = () => localStorage.getItem('wayne_editor_password') || '123456';
    // Password is 123456 by default — intentionally not shown in UI

    const attemptEditorLogin = async () => {
        if (featureFlags.authGateV1) {
            try {
                const result = await unlockWorkspace(selectedWorkspaceId, passwordInput);
                if (!result.ok || !result.data?.token) {
                    setLoginError(true);
                    return;
                }
                setAuthToken(result.data.token);
                setIsAuthenticated(true);
                setIsEditor(true);
                setShowPasswordModal(false);
                setPasswordInput('');
                setLoginError(false);
                return;
            } catch {
                setLoginError(true);
                return;
            }
        }

        if (passwordInput === getStoredPassword()) {
            setIsAuthenticated(true);
            setIsEditor(true);
            setShowPasswordModal(false);
            setPasswordInput('');
            setLoginError(false);
        } else {
            setLoginError(true);
        }
    };

    const resetPasswordSettingsForm = () => {
        setShowPasswordSettings(false);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setChangePasswordError('');
        setChangePasswordSuccess('');
    };

    const attemptPasswordChange = () => {
        const storedPassword = getStoredPassword();
        if (currentPasswordInput !== storedPassword) {
            setChangePasswordError('Current password is incorrect.');
            setChangePasswordSuccess('');
            return;
        }
        if (newPasswordInput.length < 6) {
            setChangePasswordError('Use at least 6 characters.');
            setChangePasswordSuccess('');
            return;
        }
        if (newPasswordInput === storedPassword) {
            setChangePasswordError('New password must be different.');
            setChangePasswordSuccess('');
            return;
        }
        if (newPasswordInput !== confirmPasswordInput) {
            setChangePasswordError('Passwords do not match.');
            setChangePasswordSuccess('');
            return;
        }

        localStorage.setItem('wayne_editor_password', newPasswordInput);
        setCurrentPasswordInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setChangePasswordError('');
        setChangePasswordSuccess('Passcode updated. Use it next time you sign in.');
        setShowPasswordSettings(false);
    };

    const closeModal = () => {
        setShowPasswordModal(false);
        setPasswordInput('');
        setLoginError(false);
        setShowPassword(false);
        resetPasswordSettingsForm();
    };

    React.useEffect(() => {
        apiFetch('/api/workspaces')
            .then(r => r.json())
            .then(d => {
                const items = Array.isArray(d.workspaces) ? d.workspaces : [];
                setWorkspaces(items);
                if (items.length > 0 && !items.some((w: WorkspaceOption) => w.id === selectedWorkspaceId)) {
                    const nextId = items[0].id;
                    setSelectedWorkspaceId(nextId);
                    setWorkspaceId(nextId);
                }
            })
            .catch(() => { });
    }, []);

    React.useEffect(() => {
        apiFetch('/api/preview-status')
            .then(async (r) => {
                if (!r.ok) return;
                const d = await r.json();
                setPreviewStatus(!!d.readonly, typeof d.message === 'string' ? d.message : '');
            })
            .catch(() => { });
    }, [setPreviewStatus]);

    React.useEffect(() => {
        setWorkspaceId(selectedWorkspaceId);
        if (featureFlags.authGateV1) setAuthToken('');
    }, [selectedWorkspaceId]);

    React.useEffect(() => {
        const panel = location.pathname === '/'
            ? 'calendar'
            : location.pathname.startsWith('/team')
                ? 'personnel'
                : location.pathname.startsWith('/cumulative')
                    ? 'cumulative'
                    : location.pathname.startsWith('/settings')
                        ? 'rules'
                        : location.pathname.startsWith('/app-settings')
                            ? 'settings'
                            : null;
        setMobileActivePanel(panel);
    }, [location.pathname, setMobileActivePanel]);

    React.useEffect(() => {
        if (isAuthenticated) return;
        registerGsapPlugins();

        return withGsapContext(loginRootRef.current, () => {
            const root = loginRootRef.current;
            if (!root) return;

            const ambientEls = root.querySelectorAll<HTMLElement>('[data-gsap-ambient]');
            if (!canAnimate(tier) || tier === 'minimal') {
                gsap.set(ambientEls, { clearProps: 'transform,opacity,visibility' });
                return;
            }

            ambientEls.forEach((el) => {
                const kind = el.dataset.gsapAmbient;
                const duration = Number(el.dataset.gsapDuration || 4);
                const delay = Number(el.dataset.gsapDelay || 0);

                if (kind === 'pulse') {
                    gsap.fromTo(
                        el,
                        { autoAlpha: 0.4 },
                        {
                            ...ambientFloat(tier, { autoAlpha: 0.7, y: 0, rotation: 0 }),
                            duration,
                            delay,
                        },
                    );
                    return;
                }

                if (kind === 'spin') {
                    gsap.to(el, {
                        rotate: 360,
                        repeat: -1,
                        duration: Math.max(duration, 18),
                        ease: 'none',
                        delay,
                    });
                    return;
                }

                if (kind === 'drift') {
                    gsap.to(el, ambientFloat(tier, { x: 10, y: -8, rotation: 0, duration, delay }));
                    return;
                }

                const yMap: Record<string, number> = { floatA: -9, floatB: -7, floatC: -11 };
                const rMap: Record<string, number> = { floatA: 1.5, floatB: -1, floatC: 2.5 };
                gsap.to(
                    el,
                    ambientFloat(tier, {
                        y: yMap[kind || 'floatA'] ?? -9,
                        rotation: rMap[kind || 'floatA'] ?? 1.5,
                        duration,
                        delay,
                    }),
                );
            });
        });
    }, [isAuthenticated, tier]);

    const showMobileBottomNav = featureFlags.mobileV2;
    const [mobileDockState, setMobileDockState] = React.useState<MobileDockState>(isMobileDockCollapsed ? 'compact' : 'expanded');
    const [mobileMonthLabel, setMobileMonthLabel] = React.useState(
        new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date()),
    );

    React.useEffect(() => {
        setMobileDockState(isMobileDockCollapsed ? 'compact' : 'expanded');
    }, [isMobileDockCollapsed]);

    React.useEffect(() => {
        if (!showMobileBottomNav) return;
        let lastY = window.scrollY;
        const onScroll = () => {
            const curr = window.scrollY;
            if (curr > lastY + 8) setMobileDockState('hidden');
            if (curr < lastY - 8) setMobileDockState(isMobileDockCollapsed ? 'compact' : 'expanded');
            lastY = curr;
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [isMobileDockCollapsed, showMobileBottomNav]);

    const emitMobileAction = React.useCallback((action: string, payload?: Record<string, unknown>) => {
        window.dispatchEvent(new CustomEvent('wayne:mobile-action', { detail: { action, ...payload } }));
    }, []);

    React.useEffect(() => {
        const handler = (event: Event) => {
            const label = (event as CustomEvent<{ monthLabel?: string }>).detail?.monthLabel;
            if (label) setMobileMonthLabel(label);
        };
        window.addEventListener('wayne:month-label', handler as EventListener);
        return () => window.removeEventListener('wayne:month-label', handler as EventListener);
    }, []);

    const mobileActions: MobileDockAction[] = React.useMemo(() => {
        if (location.pathname === '/') {
            return [
                { id: 'today', label: 'Today', icon: Calendar },
                { id: 'view', label: 'View', icon: FileText, active: viewMode === 'calendar' },
                { id: 'solve', label: 'Solve', icon: Pen },
                { id: 'history', label: 'History', icon: Shield },
                { id: 'import', label: 'Import', icon: Eye },
            ];
        }
        return [
            { id: 'go-calendar', label: 'Month', icon: Calendar, active: location.pathname === '/' },
            { id: 'go-team', label: 'Team', icon: Users, active: location.pathname.startsWith('/team') },
            { id: 'go-cumulative', label: 'Insight', icon: BarChart2, active: location.pathname.startsWith('/cumulative') },
            { id: 'go-rules', label: 'Rules', icon: Shield, active: location.pathname.startsWith('/settings') },
            { id: 'go-more', label: 'More', icon: Settings2, active: location.pathname.startsWith('/app-settings') },
        ];
    }, [location.pathname, viewMode]);

    const onMobileAction = React.useCallback((id: string) => {
        if (id === 'go-calendar') return navigate('/');
        if (id === 'go-team') return navigate('/team');
        if (id === 'go-cumulative') return navigate('/cumulative');
        if (id === 'go-rules') return navigate('/settings');
        if (id === 'go-more') return navigate('/app-settings');
        if (id === 'view') {
            emitMobileAction('view');
            return;
        }
        emitMobileAction(id);
    }, [emitMobileAction, navigate]);

    // ─── Landing / Login page ─────────────────────────────────────────────────
    if (!isAuthenticated) {
        return (
            <div ref={loginRootRef} className="ui-theme ui-page-root min-h-screen flex items-center justify-center p-4 sm:p-6 relative overflow-hidden"
                style={{ background: loginBg.background }}>

                <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-[1.2fr_0.8fr] gap-6 lg:gap-10 items-center">
                    <GsapScrollReveal direction="none" duration={1.1} className="order-2 lg:order-1">
                        <section className="relative p-2 sm:p-5">
                            <p className="relative text-[12px] font-semibold text-stone-500 mb-3">Wayne System</p>
                            <GsapPremiumText text="Plan with clarity." as="h1" className="relative text-4xl sm:text-6xl font-black text-stone-900 tracking-tight leading-[1.02]" />
                            <GsapPremiumText text="Run every shift with ease." as="h2" className="relative text-2xl sm:text-4xl font-bold text-stone-700 tracking-tight leading-[1.14] mt-1" delay={0.34} />
                            <p className="relative mt-5 text-base sm:text-lg font-semibold text-stone-700">จัดเวรง่ายอย่างกะเพื่อนจัดให้</p>
                            <p className="relative mt-1.5 text-sm text-stone-600">Plan with clarity. Run every shift with ease.</p>

                            <div className="relative mt-10 h-52 sm:h-64 select-none">
                                <div
                                    className="absolute left-5 sm:left-12 top-7 rounded-3xl border w-52 sm:w-60 px-5 py-4 shadow-xl"
                                    data-gsap-ambient="floatA"
                                    data-gsap-duration="3.6"
                                    style={{ background: '#fffaf3', borderColor: 'rgba(43,42,40,0.12)', boxShadow: '0 12px 36px rgba(43,42,40,0.10)' }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex gap-1.5">
                                            {[1, 2, 3].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-stone-200" />)}
                                        </div>
                                        <span className="w-14 h-2 rounded-full bg-emerald-200/70" />
                                    </div>
                                    {[
                                        ['bg-emerald-200/80', 'bg-stone-100', 'bg-emerald-100/80', 'bg-stone-100'],
                                        ['bg-stone-100', 'bg-amber-200/80', 'bg-stone-100', 'bg-amber-100/80'],
                                        ['bg-blue-100/80', 'bg-stone-100', 'bg-blue-200/80', 'bg-stone-100'],
                                    ].map((row, i) => (
                                        <div key={i} className="flex gap-1.5 mb-1.5">
                                            {row.map((cls, j) => <span key={j} className={`flex-1 h-2.5 rounded-sm ${cls}`} />)}
                                        </div>
                                    ))}
                                </div>

                                <div className="absolute right-4 sm:right-14 top-3 bg-emerald-100/80 text-emerald-800 text-[10px] font-semibold px-3 py-1.5 rounded-full border border-emerald-200/50 shadow-sm whitespace-nowrap"
                                    data-gsap-ambient="drift"
                                    data-gsap-duration="3.4">
                                    1st Call
                                </div>
                                <div className="absolute right-8 sm:right-20 top-20 bg-amber-100/85 text-amber-800 text-[10px] font-semibold px-3 py-1.5 rounded-full border border-amber-200/50 shadow-sm whitespace-nowrap"
                                    data-gsap-ambient="floatB"
                                    data-gsap-duration="3.2"
                                    data-gsap-delay="0.3">
                                    2nd Call
                                </div>
                                <div className="absolute left-1 sm:left-6 bottom-8 bg-blue-100/85 text-blue-800 text-[10px] font-semibold px-3 py-1.5 rounded-full border border-blue-200/50 shadow-sm whitespace-nowrap"
                                    data-gsap-ambient="floatC"
                                    data-gsap-duration="3.1"
                                    data-gsap-delay="0.8">
                                    3rd Call
                                </div>
                                <div className="absolute right-14 bottom-4 bg-[#fff8ef]/90 border border-stone-200/70 px-3 py-2 rounded-2xl shadow-sm text-[11px] font-semibold text-stone-700"
                                    data-gsap-ambient="floatA"
                                    data-gsap-duration="3.9"
                                    data-gsap-delay="0.5">
                                    Team ready
                                </div>
                            </div>
                        </section>
                    </GsapScrollReveal>

                    <GsapScrollReveal direction="none" duration={1.1} className="order-1 lg:order-2">
                        <div className="ui-panel-raised rounded-3xl overflow-visible relative"
                            style={{
                                background: '#fffaf3',
                                border: '1px solid rgba(43,42,40,0.12)',
                                boxShadow: '0 16px 36px rgba(43,42,40,0.12)',
                            }}>
                            <div className="px-8 pt-7 pb-2 text-center">
                                <GsapMagnetic>
                                    <div className="w-12 h-12 mx-auto mb-4 rounded-2xl flex items-center justify-center shadow-sm"
                                        style={{ background: loginHero.background }}>
                                        <Calendar className="w-6 h-6 text-stone-700" />
                                    </div>
                                </GsapMagnetic>
                                <h3 className="text-2xl font-bold text-stone-900">Wayne Duty Management</h3>
                            </div>

                            <div className="px-7 pb-7 pt-5 space-y-2.5">
                                <GsapMagnetic className="w-full">
                                    <button
                                        onClick={() => {
                                            setShowPasswordModal(true);
                                            setLoginError(false);
                                            setChangePasswordError('');
                                            setChangePasswordSuccess('');
                                            setShowPasswordSettings(false);
                                        }}
                                        className="group ui-btn ui-btn-success w-full flex items-center gap-3.5 px-5 py-3 rounded-2xl font-semibold text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                                        style={{ boxShadow: '0 6px 14px rgba(43,42,40,0.10)' }}
                                    >
                                        <div className="w-9 h-9 rounded-xl bg-white/45 flex items-center justify-center shrink-0 group-hover:bg-white/60 transition-colors">
                                            <Pen className="w-4 h-4" />
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className="text-sm leading-tight text-emerald-900 font-semibold">Editor</div>
                                            <div className="text-emerald-800/90 text-[11px]">Full access. Password required.</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 opacity-55 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                </GsapMagnetic>

                                <button
                                    onClick={() => { setIsAuthenticated(true); setIsEditor(false); }}
                                    className="group ui-btn ui-btn-neutral w-full flex items-center gap-3.5 px-5 py-3 rounded-2xl font-semibold text-sm transition-all hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors bg-[#f1ece2]">
                                        <Eye className="w-4 h-4 text-stone-500" />
                                    </div>
                                    <div className="text-left flex-1">
                                        <div className="text-sm leading-tight text-stone-700 font-semibold">Guest</div>
                                        <div className="text-[11px] text-stone-500">View only. No password.</div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 opacity-30 group-hover:translate-x-0.5 transition-transform" />
                                </button>

                                <div className="relative pt-1">
                                    <button
                                        onClick={() => setShowChangelogPopup((p) => !p)}
                                        className="group ui-btn ui-btn-info w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
                                        style={{
                                            background: getGradientRecipe('changelog', 'hero-bg').background,
                                        }}
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-[#f0ece4] flex items-center justify-center shrink-0">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className="leading-tight text-[#32475f] font-semibold">What's New</div>
                                            <div className="text-[11px] text-[#4a5e76]">See release highlights and full changelog</div>
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#e8e2f2] text-[#54476f]">{latestVersion}</span>
                                        <ChevronRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                                    </button>

                                    {showChangelogPopup && (
                                        <GsapPresence
                                            preset="banner"
                                            className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl z-20 overflow-hidden"
                                            style={{
                                                background: '#fffaf3',
                                                backdropFilter: 'blur(16px)',
                                                border: '1px solid rgba(43,42,40,0.12)',
                                                boxShadow: '0 8px 24px rgba(43,42,40,0.10)',
                                            }}
                                        >
                                            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-stone-100">
                                                <span className="text-xs text-stone-700 font-semibold">What's New in {latestVersion}</span>
                                                <button onClick={() => setShowChangelogPopup(false)} className="p-0.5 text-stone-400 hover:text-stone-600 transition-colors">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="px-4 py-3">
                                                <ul className="space-y-1.5">
                                                    {popupHighlights.length > 0 ? popupHighlights.map((line, i) => (
                                                        <li key={i} className="text-[11px] text-stone-600 leading-snug">{line}</li>
                                                    )) : (
                                                        <li className="text-[11px] text-stone-600 leading-snug">See the latest release details in the Changelog page.</li>
                                                    )}
                                                </ul>
                                                <p className="mt-2 text-[10px] text-stone-400">Full details are available on the Changelog page inside the app.</p>
                                            </div>
                                        </GsapPresence>
                                    )}

                                    {false && (
                                        <GsapPresence preset="banner" className="absolute bottom-full mb-2 left-0 right-0 rounded-2xl z-20 overflow-hidden"
                                            style={{
                                                background: 'rgba(255,255,255,0.97)',
                                                backdropFilter: 'blur(16px)',
                                                border: '1px solid rgba(220,216,210,0.7)',
                                                boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                                            }}>
                                            <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-stone-100">
                                                <span className="text-xs font-bold text-stone-700">Release History</span>
                                                <button onClick={() => setShowChangelogPopup(false)} className="p-0.5 text-stone-400 hover:text-stone-600 transition-colors">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="px-4 py-3 space-y-3.5 max-h-[260px] overflow-y-auto">
                                                <div>
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#d1fae5', color: '#065f46' }}>v4.0</span>
                                                        <span className="text-[9px] text-stone-400">Mar 2026</span>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {[
                                                            ['✨', 'Personnel UI Refinements'],
                                                            ['⚡', 'Performance Optimizations for Free Plan'],
                                                            ['🔄', 'Direct Calendar Highlights'],
                                                            ['📅', 'Per-Month Personnel Management'],
                                                        ].map(([icon, text], i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-stone-600 leading-snug">
                                                                <span className="shrink-0">{icon}</span>
                                                                <span>{text}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="border-t border-stone-100 pt-3">
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">v3.0</span>
                                                        <span className="text-[9px] text-stone-400">Feb 2026</span>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {[
                                                            ['🏗', 'Modular architecture & Zustand stores'],
                                                            ['📊', 'Firebase cumulative shift tracker'],
                                                            ['🤖', '3-phase solver: Greedy → SA → LNS'],
                                                            ['🏷', 'Tag-based constraint system'],
                                                            ['👁', 'Personnel highlight panel'],
                                                        ].map(([icon, text], i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-stone-500 leading-snug">
                                                                <span className="shrink-0">{icon}</span>
                                                                <span>{text}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="border-t border-stone-100 pt-3">
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">v2.5</span>
                                                        <span className="text-[9px] text-stone-400">Q4 2025</span>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {[
                                                            ['📋', 'Excel export layout optimised'],
                                                            ['☀️', 'Noon-shift day assignment UI'],
                                                            ['✨', 'GSAP modal animations'],
                                                        ].map(([icon, text], i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-[11px] text-stone-500 leading-snug">
                                                                <span className="shrink-0">{icon}</span>
                                                                <span>{text}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div className="border-t border-stone-100 pt-3">
                                                    <div className="flex items-center gap-1.5 mb-1.5">
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400">Earlier</span>
                                                    </div>
                                                    <ul className="space-y-0.5">
                                                        {[
                                                            ['v2.0', 'Auto-solver v1 + 1st/2nd/3rd call view'],
                                                            ['v1.0', 'Core duty planner launch'],
                                                        ].map(([ver, text], i) => (
                                                            <li key={i} className="flex items-start gap-1.5 text-[10px] text-stone-400 leading-snug">
                                                                <span className="shrink-0 font-bold">{ver}</span>
                                                                <span>{text}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </GsapPresence>
                                    )}
                                </div>
                            </div>

                            <p className="text-center text-stone-400 text-[10px] pb-5 font-medium">
                                Wayne Duty Scheduler &copy; {new Date().getFullYear()}
                            </p>
                        </div>
                    </GsapScrollReveal>
                </div>

                {/* Password modal */}
                {showPasswordModal && (
                    <GsapPresence preset="banner" className="fixed inset-0 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        style={{ background: 'rgba(43,42,40,0.28)' }}>
                        <GsapPresence preset="modal" className="rounded-3xl p-7 shadow-2xl max-w-sm w-full"
                            style={{
                                background: '#fffaf3',
                                border: '1px solid rgba(43,42,40,0.12)',
                            }}>
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#d9eadf' }}>
                                        <Shield className="w-5 h-5" style={{ color: '#2f4f3c' }} />
                                    </div>
                                    <h3 className="text-lg font-bold text-stone-900">{showPasswordSettings ? 'Manage Passcode' : 'Editor Sign In'}</h3>
                                </div>
                                <button onClick={closeModal} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-stone-400" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                {!showPasswordSettings && (
                                    <>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-stone-600 mb-1.5">Password</label>
                                            <div className="relative">
                                                <input
                                                    autoFocus
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={passwordInput}
                                                    onChange={e => { setPasswordInput(e.target.value); setLoginError(false); }}
                                                    onKeyDown={e => e.key === 'Enter' && attemptEditorLogin()}
                                                    className={`w-full px-4 py-3 bg-[#fffefb] rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 border pr-12 transition-colors
                                                        ${loginError ? 'border-rose-300 focus:ring-rose-400/30' : 'border-stone-200 focus:ring-emerald-500/30'}`}
                                                    placeholder="Enter your password"
                                                />
                                                <button type="button" onClick={() => setShowPassword(p => !p)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-600 transition-colors">
                                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {loginError && <p className="text-xs text-rose-500 mt-1.5 font-medium">The password you entered is incorrect.</p>}
                                            {changePasswordSuccess && <p className="text-xs text-emerald-600 mt-1.5 font-medium">{changePasswordSuccess}</p>}
                                        </div>
                                        <button onClick={attemptEditorLogin}
                                            className="ui-btn ui-btn-success w-full py-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                                            style={{ boxShadow: '0 6px 14px rgba(43,42,40,0.10)' }}>
                                            Unlock Editor
                                        </button>
                                        <div className="pt-0.5 text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowPasswordSettings(true);
                                                    setLoginError(false);
                                                    setChangePasswordError('');
                                                    setChangePasswordSuccess('');
                                                }}
                                                className="text-[11px] text-stone-500 hover:text-stone-700 transition-colors underline decoration-stone-300/60 underline-offset-4"
                                            >
                                                Manage passcode
                                            </button>
                                        </div>
                                    </>
                                )}

                                {showPasswordSettings && (
                                    <>
                                        <p className="text-xs text-stone-500 -mt-1">Update your editor passcode for this device.</p>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-stone-600 mb-1.5">Current password</label>
                                            <input
                                                autoFocus
                                                type="password"
                                                value={currentPasswordInput}
                                                onChange={(e) => { setCurrentPasswordInput(e.target.value); setChangePasswordError(''); setChangePasswordSuccess(''); }}
                                                onKeyDown={e => e.key === 'Enter' && attemptPasswordChange()}
                                                className="w-full px-4 py-3 bg-[#fffefb] rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 border border-stone-200 focus:ring-emerald-500/30 transition-colors"
                                                placeholder="Current password"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-stone-600 mb-1.5">New password</label>
                                            <input
                                                type="password"
                                                value={newPasswordInput}
                                                onChange={(e) => { setNewPasswordInput(e.target.value); setChangePasswordError(''); setChangePasswordSuccess(''); }}
                                                onKeyDown={e => e.key === 'Enter' && attemptPasswordChange()}
                                                className="w-full px-4 py-3 bg-[#fffefb] rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 border border-stone-200 focus:ring-emerald-500/30 transition-colors"
                                                placeholder="Use at least 6 characters"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-semibold text-stone-600 mb-1.5">Confirm new password</label>
                                            <input
                                                type="password"
                                                value={confirmPasswordInput}
                                                onChange={(e) => { setConfirmPasswordInput(e.target.value); setChangePasswordError(''); setChangePasswordSuccess(''); }}
                                                onKeyDown={e => e.key === 'Enter' && attemptPasswordChange()}
                                                className="w-full px-4 py-3 bg-[#fffefb] rounded-xl text-sm text-stone-800 focus:outline-none focus:ring-2 border border-stone-200 focus:ring-emerald-500/30 transition-colors"
                                                placeholder="Confirm new password"
                                            />
                                        </div>
                                        {changePasswordError && <p className="text-xs text-rose-500 -mt-1 font-medium">{changePasswordError}</p>}
                                        <div className="pt-1 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={resetPasswordSettingsForm}
                                                className="ui-btn ui-btn-neutral flex-1 py-2.5 rounded-xl transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={attemptPasswordChange}
                                                className="ui-btn ui-btn-success flex-1 py-2.5 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                                                style={{ boxShadow: '0 6px 14px rgba(43,42,40,0.10)' }}
                                            >
                                                Update passcode
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </GsapPresence>
                    </GsapPresence>
                )}
            </div>
        );
    }

    // ─── App Shell ────────────────────────────────────────────────────────────
    const getNavClass = (isActive: boolean, _activeColor = 'emerald') => {
        return `flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all text-[14px] font-medium
            ${isSidebarCollapsed ? 'justify-center w-10 h-10 px-0' : ''}
            ${isActive ? 'shadow-sm' : ''}`;
    };

    const getNavActiveStyle = (isActive: boolean, _activeColor = 'emerald'): React.CSSProperties | undefined => {
        if (!isActive) return {
            color: 'var(--ui-text-secondary)',
        };
        return {
            background: 'var(--ui-nav-active-bg)',
            boxShadow: 'var(--nb-shadow-sm)',
            color: 'var(--ui-nav-active-text)',
            border: '1px solid var(--ui-border)',
            borderLeft: '3px solid var(--ui-nav-active-text)',
        };
    };

    const navRouteItem = (to: string, end: boolean, icon: React.ReactNode, label: string, activeColor = 'emerald') => (
        <GsapMagnetic className={isSidebarCollapsed ? 'w-full flex justify-center' : 'w-full'}>
            <NavLink to={to} end={end} title={isSidebarCollapsed ? label : undefined} className={({ isActive }) => {
                return getNavClass(isActive, activeColor);
            }} style={({ isActive }) => getNavActiveStyle(isActive, activeColor)}>
                <div className="shrink-0">{icon}</div>
                {!isSidebarCollapsed && <span className="truncate">{label}</span>}
            </NavLink>
        </GsapMagnetic>
    );

    const navCalendarModeItem = (mode: 'calendar' | 'excel', icon: React.ReactNode, label: string, activeColor = 'cool-soft') => {
        const isActive = location.pathname === '/' && viewMode === mode;
        return (
            <GsapMagnetic className={isSidebarCollapsed ? 'w-full flex justify-center' : 'w-full'}>
                <Link
                    to="/"
                    onClick={() => setViewMode(mode)}
                    title={isSidebarCollapsed ? label : undefined}
                    className={getNavClass(isActive, activeColor)}
                    style={getNavActiveStyle(isActive, activeColor)}
                >
                    <div className="shrink-0">{icon}</div>
                    {!isSidebarCollapsed && <span className="truncate">{label}</span>}
                </Link>
            </GsapMagnetic>
        );
    };

    return (
        <div className="ui-theme flex h-screen overflow-hidden gradient-shell" style={{ background: shellBg.background }}>

            {/* Sidebar */}
            <aside className={`ui-shell-sidebar flex-col hidden md:flex transition-all duration-300 ${isSidebarCollapsed ? 'w-[72px]' : 'w-64'}`}
                style={{ background: sidebarBg.background }}>

                {/* Brand */}
                <div className="p-4 flex items-center gap-3 relative" style={{ borderBottom: '1px solid var(--ui-border)', minHeight: '88px' }}>
                    <GsapMagnetic>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 mx-auto"
                            style={{ background: 'var(--ui-accent-soft)', color: 'var(--ui-text-primary)', boxShadow: 'var(--nb-shadow-sm)' }}>
                            W
                        </div>
                    </GsapMagnetic>
                    {!isSidebarCollapsed && (
                        <div className="flex-1 min-w-0">
                            <h1 className="caps-title leading-tight text-[15px] truncate" style={{ color: 'var(--ui-text-primary)' }}>Duty Planner</h1>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium mt-0.5"
                                style={{ background: isEditor ? 'var(--ui-success-soft)' : 'var(--ui-surface-subtle)', color: 'var(--ui-text-secondary)' }}>
                                {isEditor ? 'Editor' : 'Guest'}
                            </span>
                            {isPreviewReadonly && (
                                <div className="mt-1.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-300">
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        Preview Read only
                                    </span>
                                </div>
                            )}
                            <div className="mt-2">
                                <select
                                    value={selectedWorkspaceId}
                                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                                    className="w-full text-[11px] px-2 py-1.5 rounded-md"
                                    style={{ border: '1px solid var(--ui-border)', background: 'var(--ui-surface-raised)', color: 'var(--ui-text-primary)' }}
                                >
                                    {workspaces.length === 0 && <option value="default">default</option>}
                                    {workspaces.map((w) => (
                                        <option key={w.id} value={w.id}>{w.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden flex flex-col items-center">
                    {!isSidebarCollapsed ? <p className="text-[11px] w-full caps-micro ui-text-muted px-3 pb-1.5 pt-3">Schedule</p> : <div className="h-6" />}
                    {navCalendarModeItem('calendar', <Calendar className="w-4 h-4" />, 'Calendar')}
                    {navCalendarModeItem('excel', <FileText className="w-4 h-4" />, 'Spreadsheet')}

                    {!isSidebarCollapsed ? <p className="text-[11px] w-full caps-micro ui-text-muted px-3 pb-1.5 pt-5">Management</p> : <div className="h-4" />}
                    {navRouteItem('/team', false, <Users className="w-4 h-4" />, 'Personnel', 'cool-soft')}
                    {navRouteItem('/cumulative', false, <BarChart2 className="w-4 h-4" />, 'Cumulative Insights', 'indigo')}

                    {!isSidebarCollapsed ? <p className="text-[11px] w-full caps-micro ui-text-muted px-3 pb-1.5 pt-5">General</p> : <div className="h-4" />}
                    {navRouteItem('/changelog', false, <Shield className="w-4 h-4" />, 'Changelog')}

                    {!isSidebarCollapsed ? <p className="text-[11px] w-full caps-micro ui-text-muted px-3 pb-1.5 pt-5">Configuration</p> : <div className="h-4" />}
                    {navRouteItem('/settings', false, <Settings2 className="w-4 h-4" />, 'Rules & Tags')}
                </nav>

                {/* Toggle & Disconnect */}
                <div className="p-3 space-y-2" style={{ borderTop: '1px solid var(--ui-border)' }}>
                    <GsapMagnetic className={isSidebarCollapsed ? 'w-full flex justify-center' : 'w-full'}>
                        <NavLink
                            to="/app-settings"
                            title={isSidebarCollapsed ? 'Settings' : undefined}
                            className={({ isActive }) => `flex items-center gap-3 py-3 rounded-xl transition-all text-[14px] font-medium
                                ${isSidebarCollapsed ? 'justify-center w-full' : 'px-3 w-full'}
                                ${isActive ? 'bg-stone-100 text-stone-900 shadow-sm' : ''}`}
                            style={({ isActive }) => isActive ? {
                                background: 'var(--ui-nav-active-bg)',
                                color: 'var(--ui-nav-active-text)',
                                boxShadow: 'var(--nb-shadow-sm)',
                                border: '1px solid var(--ui-border)',
                                borderLeft: '3px solid var(--ui-nav-active-text)'
                            } : { color: 'var(--ui-text-muted)' }}
                        >
                            <div className="shrink-0"><Settings2 className="w-4 h-4" /></div>
                            {!isSidebarCollapsed && <span className="truncate">Settings</span>}
                        </NavLink>
                    </GsapMagnetic>
                    <button
                        onClick={() => { setAuthToken(''); setIsAuthenticated(false); setIsEditor(false); }}
                        className={`flex items-center gap-3 py-3 rounded-xl transition-colors text-[14px] font-medium w-full
                            ${isSidebarCollapsed ? 'justify-center' : 'px-3'}`}
                        style={{ color: 'var(--ui-text-muted)' }}
                        title={isSidebarCollapsed ? "Disconnect" : undefined}
                    >
                        <LogOut className="w-4 h-4 shrink-0" />
                        {!isSidebarCollapsed && "Disconnect"}
                    </button>
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className={`flex items-center gap-3 py-3 rounded-xl transition-colors text-[14px] font-medium w-full
                            ${isSidebarCollapsed ? 'justify-center' : 'px-3'}`}
                        style={{ color: 'var(--ui-text-muted)' }}
                        title={isSidebarCollapsed ? "Expand Sidebar" : undefined}
                    >
                        {isSidebarCollapsed ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
                        {!isSidebarCollapsed && "Collapse Sidebar"}
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="ui-shell-main flex-1 flex flex-col h-full overflow-hidden relative md:rounded-l-2xl z-10">
                {isPreviewReadonly && !previewBannerDismissed && (
                    <div className="mx-3 mt-3 px-4 py-2 rounded-xl border border-amber-300 bg-amber-100/80 text-amber-900 text-sm font-bold flex items-center justify-between gap-3">
                        <span>{previewMessage || 'คุณกำลังดูเดโม ปุ่มแก้ไขถูกปิด'}</span>
                        <button
                            onClick={() => {
                                setPreviewBannerDismissed(true);
                                sessionStorage.setItem('wayne_preview_banner_dismissed', '1');
                            }}
                            className="p-1 rounded-md hover:bg-amber-100"
                            title="Dismiss"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
                {showMobileBottomNav && (
                    <MobileTopHeader
                        monthLabel={mobileMonthLabel}
                        workspaceId={selectedWorkspaceId}
                        workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
                        onWorkspaceChange={(id) => setSelectedWorkspaceId(id)}
                        onPrevMonth={() => emitMobileAction('month-prev')}
                        onNextMonth={() => emitMobileAction('month-next')}
                        isLocked={false}
                        isReadonly={isPreviewReadonly}
                    />
                )}
                <div className={`flex-1 overflow-hidden ${showMobileBottomNav ? 'pb-24 md:pb-0' : ''}`}>
                    <Outlet />
                </div>
                <footer className="shrink-0 px-4 py-2 text-center text-[9px] sm:text-[10px]" style={{ color: 'var(--ui-text-muted)' }}>
                    &copy;2026 M100 - A PLAYGROUND PROJECT. ALL RIGHT RESERVED
                </footer>
                {showMobileBottomNav && (
                    <FloatingToolDock
                        state={mobileDockState}
                        actions={mobileActions}
                        onAction={onMobileAction}
                        onToggleCollapse={() => {
                            const next = !isMobileDockCollapsed;
                            setIsMobileDockCollapsed(next);
                            setMobileDockState(next ? 'compact' : 'expanded');
                        }}
                    />
                )}
            </main>
        </div>
    );
}
