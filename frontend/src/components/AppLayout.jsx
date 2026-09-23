import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import IncidentSync from './IncidentSync';
import { Activity, BookOpen, HardHat, LayoutDashboard, Lightbulb, Menu, Radio, ShieldCheck, Smartphone, Sun, Wrench, X } from 'lucide-react';

const primaryLinks = [
  ['/', 'My Day', Sun], ['/live', 'SwingSense', Activity], ['/safety', 'Safety', ShieldCheck],
  ['/insights', 'Insights', Lightbulb], ['/training', 'Training', BookOpen],
];
const utilityLinks = [
  ['/incidents', 'Incident reports', ShieldCheck], ['/device-check', 'Device check', Smartphone], ['/estimate', 'Time estimate', Wrench],
  ['/dashboard', 'Supervisor view', LayoutDashboard],
];

function Brand({ mobile = false }) {
  return <Link to="/" className={`brand ${mobile ? 'mobile-brand' : ''}`} aria-label="CATalog — My Day">
    <span className="brand-mark"><HardHat size={26} aria-hidden="true"/></span>
    <span>CATalog<span className="brand-period">.</span></span>
  </Link>;
}

function NavigationLinks({ links }) {
  return links.map(([url, title, Icon]) => <NavLink key={url} to={url} end={url === '/'}
    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
    <Icon size={20} aria-hidden="true"/><span>{title}</span>
  </NavLink>);
}

export default function AppLayout({ children, connection }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef(null);
  const sidebarRef = useRef(null);
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);
  const pageTitle = [...primaryLinks, ...utilityLinks].find(([path]) => path === pathname)?.[1] || 'Operator workspace';

  useEffect(() => {
    if (previousPath.current !== pathname) {
      setMenuOpen(false);
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
      previousPath.current = pathname;
    }
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    function escape(event) {
      if (event.key === 'Escape') { setMenuOpen(false); toggleRef.current?.focus(); }
    }
    function outside(event) {
      if (!sidebarRef.current?.contains(event.target) && !toggleRef.current?.contains(event.target)) setMenuOpen(false);
    }
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [menuOpen]);

  function toggleMenu() {
    setMenuOpen(!menuOpen);
    if (!menuOpen) requestAnimationFrame(() => sidebarRef.current?.querySelector('.nav-item')?.focus());
  }
  function onNavigate(event) {
    if (event.target.closest('a') && menuOpen) {
      setMenuOpen(false);
      mainRef.current?.focus({ preventScroll: true });
    }
  }

  return <div className="app-shell">
    <IncidentSync/>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside id="workspace-navigation" ref={sidebarRef} className={`sidebar ${menuOpen ? 'is-open' : ''}`} onClick={onNavigate}>
      <Brand/>
      <p className="workspace-label">OPERATOR WORKSPACE</p>
      <nav aria-label="Main navigation"><NavigationLinks links={primaryLinks}/></nav>
      <nav className="sidebar-bottom" aria-label="Tools and supervisor">
        <NavigationLinks links={utilityLinks}/>
        <div className="sidebar-note"><Radio size={18} aria-hidden="true"/><p>Built for the operator.<br/>Ready for the next shift.</p></div>
      </nav>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <Brand mobile/>
        <div className="topbar-label">WORK SMARTER. EVERY SHIFT.<strong>{pageTitle}</strong></div>
        {connection}
        <span className="avatar" aria-label="Demo operator">OP</span>
        <button ref={toggleRef} className="menu-toggle" type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="workspace-navigation" onClick={toggleMenu}>
          {menuOpen ? <X size={22} aria-hidden="true"/> : <Menu size={22} aria-hidden="true"/>}
        </button>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
