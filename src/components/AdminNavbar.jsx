import { NavLink, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

export default function AdminNavbar({ user }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/admin');
  };

  return (
    <nav className="navbar">
      <a href="/admin/dashboard" className="navbar-brand">
        <span className="brand-icon">📋</span>
        <span>Penilaian Makalah</span>
      </a>
      <ul className="navbar-nav">
        <li>
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            📊 Dashboard
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/admin/kandidat"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            👤 Kandidat
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/admin/penilai"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            🗝️ Penilai
          </NavLink>
        </li>
        <li>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
            id="btn-admin-logout"
          >
            Keluar
          </button>
        </li>
      </ul>
    </nav>
  );
}
