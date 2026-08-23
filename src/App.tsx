import React, { useState } from 'react';
import { 
  PrisonDashboard, LawyerDashboard, DlsaDashboard, 
  PrisonerPortal, PrisonerKiosk, FamilyView, AdminDashboard 
} from './pages/Dashboards';
import { Shield, Sparkles, AlertCircle, User, Lock, HeartHandshake } from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: string;
  full_name: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('ns_token'));
  const [user, setUser] = useState<User | null>(
    localStorage.getItem('ns_user') ? JSON.parse(localStorage.getItem('ns_user')!) : null
  );
  const [kioskMode, setKioskMode] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sign up fields
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regRole, setRegRole] = useState('prisoner');
  const [regContact, setRegContact] = useState('');

  // Sync token changes to storage
  const handleLoginSuccess = (newToken: string, loggedUser: User) => {
    localStorage.setItem('ns_token', newToken);
    localStorage.setItem('ns_user', JSON.stringify(loggedUser));
    setToken(newToken);
    setUser(loggedUser);
    setKioskMode(loggedUser.role === 'prisoner'); // Auto-enter kiosk mode for prisoners as fallback
    setError(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('ns_token');
    localStorage.removeItem('ns_user');
    setToken(null);
    setUser(null);
    setKioskMode(false);
  };

  // Form Submit Login
  const handleFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      handleLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Form Submit Register
  const handleFormRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername || !regPassword || !regFullName || !regRole) return;
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername,
          password: regPassword,
          role: regRole,
          fullName: regFullName,
          contactInfo: regContact
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setSuccessMessage('Registration successful! Welcome to NyayaSetu.');
      if (data.token && data.user) {
        handleLoginSuccess(data.token, data.user);
      } else {
        setIsSignUpMode(false);
        setUsernameInput(regUsername);
        setPasswordInput(regPassword);
      }
      setRegUsername('');
      setRegPassword('');
      setRegFullName('');
      setRegContact('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // One-click Demo Login shortcut
  const handleDemoLogin = async (roleUsername: string, rolePassword: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: roleUsername, password: rolePassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      handleLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Floating switcher login helper
  const handleQuickSwap = (roleName: string) => {
    const credentials: Record<string, [string, string]> = {
      prison_official: ['prison_admin', 'password123'],
      dlsa_officer: ['dlsa_rahul', 'password123'],
      lawyer: ['lawyer_shreya', 'password123'],
      prisoner: ['amit_sharma', 'prisoner123'],
      family_member: ['amit_family', 'family123'],
      admin: ['admin_root', 'password123']
    };

    const creds = credentials[roleName];
    if (creds) {
      handleDemoLogin(creds[0], creds[1]);
    }
  };

  // Select Dashboard based on user role
  const renderDashboard = () => {
    if (!user || !token) return null;

    // Prisoner has normal portal vs touch kiosk mode switcher
    if (user.role === 'prisoner') {
      if (kioskMode) {
        return (
          <PrisonerKiosk 
            user={user} 
            token={token} 
            onLogout={handleLogout} 
            onExitKiosk={() => setKioskMode(false)} 
          />
        );
      }
      return (
        <PrisonerPortal 
          user={user} 
          token={token} 
          onLogout={handleLogout} 
          onEnterKiosk={() => setKioskMode(true)} 
        />
      );
    }

    switch (user.role) {
      case 'prison_official':
        return <PrisonDashboard user={user} token={token} onLogout={handleLogout} />;
      case 'lawyer':
        return <LawyerDashboard user={user} token={token} onLogout={handleLogout} />;
      case 'dlsa_officer':
        return <DlsaDashboard user={user} token={token} onLogout={handleLogout} />;
      case 'family_member':
        return <FamilyView user={user} token={token} onLogout={handleLogout} />;
      case 'admin':
        return <AdminDashboard user={user} token={token} onLogout={handleLogout} />;
      default:
        return (
          <div className="p-8 text-center text-rose-400">
            Unrecognized account role: {user.role}. Contact administrator.
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 md:p-8">
      {/* Top Banner Header */}
      <header className="max-w-7xl mx-auto w-full flex items-center justify-between mb-8 pb-4 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/20 border border-primary-400/30">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black tracking-tight text-white m-0 leading-tight">
              NyayaSetu
            </h1>
            <p className="text-[10px] md:text-xs text-slate-450 tracking-wider font-semibold uppercase">Undertrial Justice Coordination Platform</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-450 font-medium">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Accused in custody are presumed innocent under the law</span>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto w-full flex-1 mb-12">
        {token && user ? (
          renderDashboard()
        ) : (
          /* Login Page Layout */
          <div className="max-w-md mx-auto space-y-6 pt-6">
            <div className="glass-panel p-6 space-y-6 bg-slate-900/80 border-slate-800/60 shadow-2xl">
              <div className="text-center space-y-2">
                <HeartHandshake className="w-8 h-8 text-sky-400 mx-auto" />
                <h2 className="text-xl font-bold text-slate-100">Secure Portal Access</h2>
                <p className="text-xs text-slate-400">Login with credentials assigned by DLSA or Prison Intake, or Sign Up for testing</p>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-800/80">
                <button
                  type="button"
                  onClick={() => { setIsSignUpMode(false); setError(null); setSuccessMessage(null); }}
                  className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                    !isSignUpMode
                      ? 'border-sky-500 text-sky-400 font-bold'
                      : 'border-transparent text-slate-450 hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setIsSignUpMode(true); setError(null); setSuccessMessage(null); }}
                  className={`flex-1 pb-2.5 text-xs font-semibold border-b-2 transition-all ${
                    isSignUpMode
                      ? 'border-sky-500 text-sky-400 font-bold'
                      : 'border-transparent text-slate-450 hover:text-slate-200'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {error && (
                <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              {!isSignUpMode ? (
                <form onSubmit={handleFormLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Username</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Enter username"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        className="w-full glass-input pl-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        className="w-full glass-input pl-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 border border-primary-500/40 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleFormRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Full Name</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. Jatin Sharma"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        className="w-full glass-input pl-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Username</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="e.g. jatin"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="w-full glass-input pl-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="w-full glass-input pl-9 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Access Role</label>
                    <select
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value)}
                      className="w-full glass-input text-xs bg-slate-900 border border-slate-800 text-slate-200 py-2 px-3 focus:outline-none"
                    >
                      <option value="prisoner">Prisoner Portal</option>
                      <option value="prison_official">Prison Warden</option>
                      <option value="dlsa_officer">DLSA Secretary</option>
                      <option value="lawyer">Advocate Counsel</option>
                      <option value="family_member">Family Member</option>
                      <option value="admin">System Admin</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 uppercase font-semibold block">Contact Info (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9988776655 or email"
                      value={regContact}
                      onChange={(e) => setRegContact(e.target.value)}
                      className="w-full glass-input text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 border border-primary-500/40 text-xs font-bold text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? 'Registering...' : 'Sign Up'}
                  </button>
                </form>
              )}
            </div>

            {/* Quick Demo logins banner */}
            <div className="glass-panel p-5 space-y-3.5 border-slate-800/80 bg-slate-900/30">
              <h3 className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Quick-Select Demo Accounts (SIH Evaluator Panel)
              </h3>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <button
                  onClick={() => handleDemoLogin('prison_admin', 'password123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-sky-400">Prison Official</div>
                  <div>Tihar Warden Rathore</div>
                </button>
                <button
                  onClick={() => handleDemoLogin('dlsa_rahul', 'password123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-emerald-400">DLSA Officer</div>
                  <div>DLSA Secretary Rahul</div>
                </button>
                <button
                  onClick={() => handleDemoLogin('lawyer_shreya', 'password123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-amber-400">Advocate Counsel</div>
                  <div>Panel Lawyer Shreya</div>
                </button>
                <button
                  onClick={() => handleDemoLogin('amit_sharma', 'prisoner123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-violet-400">Prisoner Dashboard</div>
                  <div>Amit Sharma (Bail Pending)</div>
                </button>
                <button
                  onClick={() => handleDemoLogin('amit_family', 'family123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-pink-400">Family Account</div>
                  <div>Amit's Spouse (Restricted)</div>
                </button>
                <button
                  onClick={() => handleDemoLogin('admin_root', 'password123')}
                  className="p-2 bg-slate-950/80 border border-slate-850 hover:border-slate-700 text-left rounded-lg text-slate-300 font-semibold"
                >
                  <div className="text-rose-400">System Admin</div>
                  <div>Security Audit Trails</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Demo Role Switcher (Active when logged in) */}
      {token && user && (
        <div className="fixed bottom-4 right-4 z-50 glass-panel p-3 border-sky-500/30 bg-slate-950/90 shadow-2xl flex items-center gap-2">
          <span className="text-[9px] uppercase font-bold text-sky-400 tracking-wider">Quick Swapper:</span>
          <select
            value={user.role}
            onChange={(e) => handleQuickSwap(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-[10px] rounded py-1 px-1.5 focus:outline-none text-slate-200"
          >
            <option value="prison_official">Prison Warden</option>
            <option value="dlsa_officer">DLSA Secretary</option>
            <option value="lawyer">Advocate Shreya</option>
            <option value="prisoner">Prisoner Portal</option>
            <option value="family_member">Family Member</option>
            <option value="admin">System Admin</option>
          </select>
        </div>
      )}

      {/* Footer Pitch */}
      <footer className="max-w-7xl mx-auto w-full text-center border-t border-slate-800/40 pt-4 mt-8">
        <p className="text-[10px] md:text-xs text-slate-500">
          NyayaSetu ensures that no undertrial's legal journey gets lost between the prison, lawyer, legal-aid authority and court.
        </p>
      </footer>
    </div>
  );
}
