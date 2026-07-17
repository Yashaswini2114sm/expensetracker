import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { Users, Receipt, ArrowRightLeft, CheckCircle2, Plus, Settings, Trash2, UserMinus, History } from 'lucide-react';
import DebtGraph, { type DebtNode, type DebtLink } from '../components/DebtGraph';

interface GroupDetails {
  id: string;
  name: string;
  currentUserRole: string;
  members: { id: string; name: string; email: string; role: string; }[];
}

interface Balance {
  userId: string;
  userName: string;
  owesToId: string;
  owesToName: string;
  amount: number;
}

interface Expense {
  id: string;
  amount: number;
  description: string;
  splitType: string;
  createdAt: string;
  paidBy: { id: string; name: string };
  splits: { userId: string; userName: string; amountOwed: number }[];
}

export default function GroupDetail() {
  const { id: groupId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showSettleModal, setShowSettleModal] = useState(false);

  // Form states
  const [newGroupName, setNewGroupName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDesc, setLoanDesc] = useState('');
  const [loanBorrower, setLoanBorrower] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleTo, setSettleTo] = useState('');

  const loadData = async () => {
    try {
      const [grp, bals, exps] = await Promise.all([
        fetchApi<GroupDetails>(`/groups/${groupId}`),
        fetchApi<Balance[]>(`/groups/${groupId}/balances`),
        fetchApi<Expense[]>(`/groups/${groupId}/expenses`)
      ]);
      setGroup(grp);
      setBalances(bals);
      setExpenses(exps);
      setNewGroupName(grp.name);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [groupId]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: newMemberEmail })
      });
      setShowAddMemberModal(false);
      setNewMemberEmail('');
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to add member. Ensure the email is registered.');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await fetchApi(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to remove member. You cannot remove the last admin.');
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi(`/groups/${groupId}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newGroupName })
      });
      setShowSettingsModal(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteGroup = async () => {
    if (!confirm('Are you sure you want to permanently delete this group?')) return;
    try {
      await fetchApi(`/groups/${groupId}`, { method: 'DELETE' });
      navigate('/groups');
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group) return;
    
    const amountNum = parseFloat(expenseAmount);
    let splits: any[] = [];

    if (splitType === 'equal') {
      const splitAmount = amountNum / group.members.length;
      splits = group.members.map(m => ({
        userId: m.id,
        amountOwed: splitAmount
      }));
    } else {
      let totalCustom = 0;
      splits = Object.entries(customSplits).map(([userId, amt]) => {
        const amountOwed = parseFloat(amt) || 0;
        totalCustom += amountOwed;
        return { userId, amountOwed };
      });
      if (Math.abs(totalCustom - amountNum) > 0.01) {
        alert(`Custom splits (${totalCustom}) must equal total amount (${amountNum})`);
        return;
      }
    }

    try {
      await fetchApi(`/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          description: expenseDesc,
          amount: amountNum,
          paidBy: user!.id,
          splitType,
          splits
        })
      });
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseDesc('');
      setCustomSplits({});
      setSplitType('equal');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanBorrower) return;

    try {
      await fetchApi(`/groups/${groupId}/loans`, {
        method: 'POST',
        body: JSON.stringify({
          borrowerId: loanBorrower,
          amount: parseFloat(loanAmount),
          description: loanDesc
        })
      });
      setShowLoanModal(false);
      setLoanAmount('');
      setLoanDesc('');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleTo) return;

    try {
      await fetchApi(`/groups/${groupId}/settlements`, {
        method: 'POST',
        body: JSON.stringify({
          paidTo: settleTo,
          amount: parseFloat(settleAmount)
        })
      });
      setShowSettleModal(false);
      setSettleAmount('');
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading || !group) {
    return <div className="animate-pulse">Loading...</div>;
  }

  // Map balances to D3 Graph format
  const nodesMap = new Map<string, DebtNode>();
  group.members.forEach(m => {
    nodesMap.set(m.id, { id: m.id, name: m.name.split(' ')[0] });
  });

  const links: DebtLink[] = balances.map(b => ({
    source: b.userId, // debtor
    target: b.owesToId, // creditor
    amount: b.amount
  }));

  const myDebts = balances.filter(b => b.userId === user?.id);
  const owedToMe = balances.filter(b => b.owesToId === user?.id);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{group.name}</h1>
            {group.currentUserRole === 'admin' && (
              <button onClick={() => setShowSettingsModal(true)} className="p-2 hover:bg-surface/80 rounded-full transition-colors text-textMuted hover:text-text">
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="text-textMuted flex items-center gap-4 mt-2">
            <button onClick={() => setShowMembersModal(true)} className="flex items-center gap-2 hover:text-text transition-colors">
              <Users className="w-4 h-4" /> {group.members.length} members
            </button>
            {group.currentUserRole === 'admin' && (
              <button 
                onClick={() => setShowAddMemberModal(true)} 
                className="text-primary hover:text-primary/80 text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Member
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowExpenseModal(true)} className="btn-primary flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Add Expense
          </button>
          <button onClick={() => setShowLoanModal(true)} className="btn-secondary flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" /> Log Loan
          </button>
          <button onClick={() => setShowSettleModal(true)} className="btn-secondary flex items-center gap-2 !bg-emerald-500/10 !text-emerald-400 !border-emerald-500/50 hover:!bg-emerald-500/20">
            <CheckCircle2 className="w-4 h-4" /> Settle Up
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Balances List */}
        <div className="lg:col-span-1 space-y-6">
          <div className="glass-card p-6">
            <h3 className="font-bold mb-4 border-b border-border pb-2">Your Balances</h3>
            
            {myDebts.length === 0 && owedToMe.length === 0 && (
              <p className="text-sm text-textMuted">You are all settled up!</p>
            )}

            {myDebts.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-textMuted mb-2">You Owe</p>
                <div className="space-y-2">
                  {myDebts.map(d => (
                    <div key={d.owesToId} className="flex justify-between text-danger">
                      <span>{d.owesToName}</span>
                      <span className="font-bold">₹{d.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {owedToMe.length > 0 && (
              <div>
                <p className="text-sm font-medium text-textMuted mb-2">You are Owed</p>
                <div className="space-y-2">
                  {owedToMe.map(d => (
                    <div key={d.userId} className="flex justify-between text-emerald-400">
                      <span>{d.userName}</span>
                      <span className="font-bold">₹{d.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
              <History className="w-5 h-5" />
              <h3 className="font-bold">Recent Activity</h3>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {expenses.length === 0 ? (
                <p className="text-sm text-textMuted">No expenses recorded yet.</p>
              ) : (
                expenses.map(exp => (
                  <div key={exp.id} className="text-sm bg-surface/50 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold">{exp.description}</span>
                      <span className="font-medium">₹{exp.amount.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-textMuted flex justify-between">
                      <span>Paid by {exp.paidBy.id === user?.id ? 'you' : exp.paidBy.name}</span>
                      <span>{new Date(exp.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* D3 Graph */}
        <div className="lg:col-span-2 glass-card p-6 min-h-[400px] flex flex-col">
          <h3 className="font-bold mb-4">Debt Graph</h3>
          <div className="flex-1 rounded-xl overflow-hidden bg-surface/50 min-h-[400px]">
            <DebtGraph nodes={Array.from(nodesMap.values())} links={links} width={800} height={400} />
          </div>
        </div>
      </div>

      {/* Modals */}
      
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Group Settings</h3>
            <form onSubmit={handleUpdateGroup} className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-1">Rename Group</label>
                <input required type="text" className="input-field" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary flex-1">Save Name</button>
                <button type="button" onClick={() => setShowSettingsModal(false)} className="btn-secondary flex-1">Close</button>
              </div>
            </form>
            <div className="border-t border-border pt-4">
              <h4 className="text-danger font-medium mb-2">Danger Zone</h4>
              <button onClick={handleDeleteGroup} className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors">
                <Trash2 className="w-4 h-4" /> Delete Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Modal */}
      {showMembersModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            <h3 className="text-xl font-bold mb-4">Group Members</h3>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {group.members.map(m => (
                <div key={m.id} className="flex items-center justify-between bg-surface/50 p-3 rounded-lg">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {m.name} {m.id === user?.id && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">You</span>}
                      {m.role === 'admin' && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Admin</span>}
                    </div>
                    <div className="text-sm text-textMuted">{m.email}</div>
                  </div>
                  {group.currentUserRole === 'admin' && m.id !== user?.id && (
                    <button onClick={() => handleRemoveMember(m.id)} className="p-2 text-danger hover:bg-danger/10 rounded-full transition-colors" title="Remove Member">
                      <UserMinus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setShowMembersModal(false)} className="btn-secondary w-full">Close</button>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add Member</h3>
            <form onSubmit={handleAddMember} className="space-y-4">
              <input required type="email" placeholder="User's Email Address" className="input-field" value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} />
              <p className="text-sm text-textMuted my-2">Note: The user must already have a registered account.</p>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">Add</button>
                <button type="button" onClick={() => setShowAddMemberModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Add an Expense</h3>
            <form onSubmit={handleAddExpense} className="space-y-4 max-h-[70vh] overflow-y-auto">
              <input required type="text" placeholder="Description (e.g. Dinner)" className="input-field" value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} />
              <input required type="number" step="0.01" min="0.01" placeholder="Amount" className="input-field" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} />
              
              <div>
                <label className="block text-sm font-medium mb-2">Split Type</label>
                <div className="flex gap-2 p-1 bg-surface rounded-lg">
                  <button type="button" onClick={() => setSplitType('equal')} className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${splitType === 'equal' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>Equal</button>
                  <button type="button" onClick={() => setSplitType('custom')} className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${splitType === 'custom' ? 'bg-primary text-white shadow-sm' : 'text-textMuted hover:text-text'}`}>Custom Amount</button>
                </div>
              </div>

              {splitType === 'equal' ? (
                <p className="text-sm text-textMuted text-center py-2 bg-surface/30 rounded-lg">Will split equally among all {group.members.length} members.</p>
              ) : (
                <div className="space-y-2 mt-4 border-t border-border pt-4">
                  <p className="text-sm font-medium mb-2">Enter exact amounts for each member:</p>
                  {group.members.map(m => (
                    <div key={m.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm truncate">{m.name}</span>
                      <div className="relative w-32">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted">₹</span>
                        <input 
                          type="number" step="0.01" min="0" className="input-field pl-7 py-1" 
                          value={customSplits[m.id] || ''}
                          onChange={e => setCustomSplits(prev => ({...prev, [m.id]: e.target.value}))}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-medium mt-2 p-2 bg-surface rounded-lg">
                    <span>Total Allocated:</span>
                    <span className={Math.abs(Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0) - (parseFloat(expenseAmount) || 0)) > 0.01 ? 'text-danger' : 'text-emerald-400'}>
                      ₹{Object.values(customSplits).reduce((sum, val) => sum + (parseFloat(val) || 0), 0).toFixed(2)} / ₹{parseFloat(expenseAmount || '0').toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">Save Expense</button>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Loan Modal */}
      {showLoanModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Log a Loan</h3>
            <form onSubmit={handleAddLoan} className="space-y-4">
              <select required className="input-field" value={loanBorrower} onChange={e => setLoanBorrower(e.target.value)}>
                <option value="">Who did you lend to?</option>
                {group.members.filter(m => m.id !== user?.id).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <input required type="number" step="0.01" min="0.01" placeholder="Amount" className="input-field" value={loanAmount} onChange={e => setLoanAmount(e.target.value)} />
              <input type="text" placeholder="Description (optional)" className="input-field" value={loanDesc} onChange={e => setLoanDesc(e.target.value)} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">Save Loan</button>
                <button type="button" onClick={() => setShowLoanModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Up Modal */}
      {showSettleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Settle Up</h3>
            <form onSubmit={handleSettle} className="space-y-4">
              <select required className="input-field" value={settleTo} onChange={e => setSettleTo(e.target.value)}>
                <option value="">Who did you pay?</option>
                {myDebts.map(d => (
                  <option key={d.owesToId} value={d.owesToId}>{d.owesToName} (Owe ₹{d.amount.toFixed(2)})</option>
                ))}
              </select>
              <input required type="number" step="0.01" min="0.01" placeholder="Amount paid" className="input-field" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} />
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
                   <CheckCircle2 className="w-4 h-4"/> Record Payment
                </button>
                <button type="button" onClick={() => setShowSettleModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
