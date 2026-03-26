import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HiHome, HiBriefcase, HiPlusCircle, HiMenu, HiX, HiLogout, HiUser, HiCog, HiChevronDown } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, signOut } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (path: string) => location.pathname === path;

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
      setUserMenuOpen(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            <img src="/logo.svg" alt="CTrackr Logo" className="logo-img" />
            <h1>CTrackr</h1>
          </Link>
          <button 
            className="mobile-menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <HiX /> : <HiMenu />}
          </button>
          <nav className={`nav ${mobileMenuOpen ? 'nav-open' : ''}`}>
            <Link 
              to="/" 
              className={isActive('/') ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              <HiHome className="nav-icon" />
              <span>Home</span>
            </Link>
            <Link 
              to="/applications" 
              className={isActive('/applications') && !isActive('/applications/new') ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              <HiBriefcase className="nav-icon" />
              <span>Applications</span>
            </Link>
            <Link 
              to="/applications/new" 
              className={`btn-nav ${isActive('/applications/new') ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <HiPlusCircle className="nav-icon" />
              <span>New Application</span>
            </Link>
            {isAuthenticated && (
              <div className="user-menu-container" ref={userMenuRef}>
                <button
                  className="user-menu-toggle"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-label="User menu"
                >
                  <HiCog className="user-menu-icon" />
                  <HiChevronDown className={`user-menu-chevron ${userMenuOpen ? 'open' : ''}`} />
                </button>
                {userMenuOpen && (
                  <div className="user-menu-dropdown">
                    <div className="user-menu-header">
                      <HiUser className="user-menu-avatar" />
                      <div className="user-menu-info">
                        <div className="user-menu-name">{user?.signInDetails?.loginId || 'User'}</div>
                        <div className="user-menu-email">{user?.signInDetails?.loginId || ''}</div>
                      </div>
                    </div>
                    <Link
                      to="/profile"
                      className={`user-menu-item ${isActive('/profile') ? 'active' : ''}`}
                      onClick={() => {
                        setUserMenuOpen(false);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <HiUser className="user-menu-item-icon" />
                      <span>Profile</span>
                    </Link>
                    <button
                      className="user-menu-item user-menu-signout"
                      onClick={handleSignOut}
                    >
                      <HiLogout className="user-menu-item-icon" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>
      <main className="main">
        <div className="container">
          {children}
        </div>
      </main>
      <footer className="footer">
        <div className="container">
          <p>&copy; 2024 CTrackr. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

