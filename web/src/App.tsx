import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { CreateInventory } from './pages/CreateInventory';
import { ProveOwnership } from './pages/ProveOwnership';
import { DepositWithdraw } from './pages/DepositWithdraw';
import { Transfer } from './pages/Transfer';
import { OnChain } from './pages/OnChain';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/inventory" element={<CreateInventory />} />
        <Route path="/prove" element={<ProveOwnership />} />
        <Route path="/operations" element={<DepositWithdraw />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/on-chain" element={<OnChain />} />
      </Routes>
    </Layout>
  );
}

export default App;
