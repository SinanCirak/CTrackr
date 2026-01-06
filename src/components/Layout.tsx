import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HiHome, HiBriefcase, HiPlusCircle, HiMenu, HiX, HiLogout, HiUser, HiCog } from 'react-icons/hi';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, signOut } = useAuth();

  const isActive = (path: string) => location.pathname === path;

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            <HiBriefcase className="logo-icon" />
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
              <>
                <div className="nav-divider"></div>
                <Link 
                  to="/profile" 
                  className={isActive('/profile') ? 'active' : ''}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <HiCog className="nav-icon" />
                  <span>Profile</span>
                </Link>
                <div className="user-info">
                  <HiUser className="user-icon" />
                  <span className="user-name">{user?.signInDetails?.loginId || 'User'}</span>
                </div>
                <button 
                  className="nav-signout"
                  onClick={handleSignOut}
                >
                  <HiLogout className="nav-icon" />
                  <span>Sign Out</span>
                </button>
              </>
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

