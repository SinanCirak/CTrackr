import { Link } from 'react-router-dom';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="header">
        <div className="container">
          <Link to="/" className="logo">
            <h1>CTrackr</h1>
          </Link>
          <nav className="nav">
            <Link to="/">Home</Link>
            <Link to="/applications">Applications</Link>
            <Link to="/applications/new">New Application</Link>
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

