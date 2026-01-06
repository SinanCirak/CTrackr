import { Link } from 'react-router-dom';
import { HiClipboardList, HiChartBar, HiSearch, HiPlusCircle, HiBriefcase } from 'react-icons/hi';
import './Home.css';

export default function Home() {
  return (
    <div className="home">
      <div className="hero">
        <div className="hero-icon">
          <HiBriefcase />
        </div>
        <h1>Track Your Job Applications</h1>
        <p>Stay organized and never lose track of your job applications. Manage your career journey with ease.</p>
        <div className="actions">
          <Link to="/applications/new" className="btn btn-primary">
            <HiPlusCircle className="btn-icon" />
            <span>Add New Application</span>
          </Link>
          <Link to="/applications" className="btn btn-secondary">
            <HiBriefcase className="btn-icon" />
            <span>View All Applications</span>
          </Link>
        </div>
      </div>

      <div className="features">
        <div className="feature">
          <div className="feature-icon">
            <HiClipboardList />
          </div>
          <h3>Track Everything</h3>
          <p>Keep track of company, position, status, dates, and notes for each application.</p>
        </div>
        <div className="feature">
          <div className="feature-icon">
            <HiChartBar />
          </div>
          <h3>Status Management</h3>
          <p>Monitor your applications through different stages: Applied, Interview, Offer, and more.</p>
        </div>
        <div className="feature">
          <div className="feature-icon">
            <HiSearch />
          </div>
          <h3>Easy Search</h3>
          <p>Quickly find and filter your applications by company, position, or status.</p>
        </div>
      </div>
    </div>
  );
}

