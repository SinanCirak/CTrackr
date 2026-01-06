import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Home from './pages/Home';
import Applications from './pages/Applications';
import ApplicationDetail from './pages/ApplicationDetail';
import NewApplication from './pages/NewApplication';
import Profile from './pages/Profile';
import GenerateDocuments from './pages/GenerateDocuments';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <Layout>
              <Home />
            </Layout>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <Layout>
                <Applications />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications/new"
          element={
            <ProtectedRoute>
              <Layout>
                <NewApplication />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications/:id"
          element={
            <ProtectedRoute>
              <Layout>
                <ApplicationDetail />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <Profile />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications/:id/generate"
          element={
            <ProtectedRoute>
              <Layout>
                <GenerateDocuments />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;

