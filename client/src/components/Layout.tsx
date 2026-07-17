import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { LogOut, Wallet } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface border-b border-border sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
            <Wallet className="w-6 h-6" />
            <span>Ledgerly</span>
          </Link>
          
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-textMuted hidden sm:inline-block">
                {user.name}
              </span>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-background rounded-full transition-colors text-textMuted hover:text-danger"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
