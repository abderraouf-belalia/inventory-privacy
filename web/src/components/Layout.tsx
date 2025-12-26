import { Link, useLocation } from 'react-router-dom';
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClientContext,
} from '@mysten/dapp-kit';

const navItems = [
  { path: '/', label: 'Home' },
  { path: '/inventory', label: 'Create Inventory' },
  { path: '/prove', label: 'Prove Ownership' },
  { path: '/operations', label: 'Deposit/Withdraw' },
  { path: '/transfer', label: 'Transfer' },
  { path: '/on-chain', label: 'On-Chain' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const account = useCurrentAccount();
  const { network } = useSuiClientContext();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <span className="font-bold text-lg text-gray-900">
                Inventory Privacy
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              {/* Network indicator */}
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full">
                <div
                  className={`w-2 h-2 rounded-full ${
                    network === 'mainnet'
                      ? 'bg-green-500'
                      : network === 'testnet'
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                />
                <span className="text-xs font-medium text-gray-600 capitalize">
                  {network}
                </span>
              </div>

              {/* Wallet connect button */}
              <ConnectButton
                connectText="Connect Wallet"
                className="!bg-primary-600 !text-white !rounded-lg !px-4 !py-2 !text-sm !font-medium hover:!bg-primary-700"
              />
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-gray-100 px-4 py-2 overflow-x-auto">
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Connected account banner */}
        {account && (
          <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-1.5">
            <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm">
              <svg
                className="w-4 h-4 text-emerald-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-emerald-700">
                Connected:{' '}
                <code className="bg-emerald-100 px-1.5 py-0.5 rounded text-xs">
                  {account.address.slice(0, 6)}...{account.address.slice(-4)}
                </code>
              </span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          Inventory Privacy PoC - Zero-Knowledge Proofs for Private Inventory
        </div>
      </footer>
    </div>
  );
}
