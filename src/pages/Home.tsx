import { Link } from 'react-router-dom';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <div className="hero">
        <h1>Track Your Job Applications</h1>
        <p>Stay organized and never lose track of your job applications.</p>
        <div className="actions">
          <Link to="/applications/new" className="btn btn-primary">
            Add New Application
          </Link>
          <Link to="/applications" className="btn btn-secondary">
            View All Applications
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="feature">
          <h3>📝 Track Everything</h3>
          <p>Keep track of company, position, status, dates, and notes for each application.</p>
        </div>
        <div className="feature">
          <h3>📊 Status Management</h3>
          <p>Monitor your applications through different stages: Applied, Interview, Offer, and more.</p>
        </div>
        <div className="feature">
          <h3>🔍 Easy Search</h3>
          <p>Quickly find and filter your applications by company, position, or status.</p>
        </div>
      </div>
    </div>
  );
}

