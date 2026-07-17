import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Loader2, History } from 'lucide-react';
import { fetchApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';

interface Group {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  createdAt: string;
}

interface Activity {
  type: 'expense' | 'settlement';
  id: string;
  amount: number;
  description: string;
  createdAt: string;
  groupName: string;
  paidBy: { id: string; name: string };
  paidTo?: { id: string; name: string };
}

export default function Groups() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [groupsData, activitiesData] = await Promise.all([
        fetchApi<Group[]>('/groups'),
        fetchApi<Activity[]>('/groups/activity')
      ]);
      setGroups(groupsData);
      setActivities(activitiesData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    
    try {
      await fetchApi('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newGroupName }),
      });
      setNewGroupName('');
      setIsCreating(false);
      loadData(); // Refresh list
    } catch (err) {
      console.error('Failed to create group:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Your Groups</h1>
          <p className="text-textMuted mt-1">Manage your shared expenses with friends</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>New Group</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {isCreating && (
            <div className="glass-card p-6 mb-8">
              <h3 className="font-semibold mb-4">Create a new group</h3>
              <form onSubmit={handleCreateGroup} className="flex gap-4">
                <input
                  type="text"
                  placeholder="e.g. Miami Trip 2024"
                  className="input-field flex-1"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="btn-primary whitespace-nowrap">
                  Save Group
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="btn-secondary whitespace-nowrap"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          {groups.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-xl">
              <Users className="w-12 h-12 text-textMuted mx-auto mb-4" />
              <h3 className="text-lg font-medium">No groups yet</h3>
              <p className="text-textMuted mt-1">Create a group to start splitting expenses.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {groups.map((group) => (
                <div 
                  key={group.id} 
                  onClick={() => navigate(`/groups/${group.id}`)}
                  className="glass-card p-6 hover:border-primary/50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-bold text-lg leading-tight">{group.name}</h3>
                    {group.role === 'admin' && (
                      <span className="text-[10px] uppercase tracking-wider bg-primary/20 text-primary px-2 py-1 rounded-full font-bold">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center text-sm text-textMuted">
                    <Users className="w-4 h-4 mr-2" />
                    <span>{group.memberCount} member{group.memberCount !== 1 && 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Activity Feed */}
        <div className="lg:col-span-1">
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
              <History className="w-5 h-5" />
              <h3 className="font-bold">Global Activity Feed</h3>
            </div>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {activities.length === 0 ? (
                <p className="text-sm text-textMuted">No recent activity across your groups.</p>
              ) : (
                activities.map(act => (
                  <div key={act.id} className="text-sm bg-surface/50 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-base">
                        {act.type === 'expense' ? act.description : 'Settlement'}
                      </span>
                      <span className={act.type === 'settlement' ? 'text-emerald-400 font-bold' : 'font-bold'}>
                        ₹{act.amount.toFixed(2)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-textMuted mt-2">
                      {act.type === 'expense' ? (
                        <span>Paid by {act.paidBy.id === user?.id ? 'you' : act.paidBy.name}</span>
                      ) : (
                        <span>
                          {act.paidBy.id === user?.id ? 'You' : act.paidBy.name} paid {act.paidTo?.id === user?.id ? 'you' : act.paidTo?.name}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-border/50">
                      <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full text-xs font-medium truncate max-w-[150px]">
                        {act.groupName}
                      </span>
                      <span className="text-xs text-textMuted">
                        {new Date(act.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
