
import React, { useState, useEffect } from 'react';
import { getNotifications, saveNotifications, getSession, sendMockNotification } from '../services/storage';
import { Notification, User } from '../types';
import { Bell, Check, Trash2, Mail, Handshake, FileText } from 'lucide-react';

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) {
       setUser(session);
       refreshNotifications(session.id);
    }
  }, []);

  const refreshNotifications = (userId: string) => {
    const all = getNotifications();
    // Filter for current user
    const userNotifs = all.filter(n => n.recipientId === userId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setNotifications(userNotifs);
  };

  const markAsRead = (notifId: string) => {
    const all = getNotifications();
    const updated = all.map(n => n.id === notifId ? { ...n, isRead: true } : n);
    saveNotifications(updated);
    if (user) refreshNotifications(user.id);
  };

  const deleteNotification = (notifId: string) => {
    const all = getNotifications();
    const updated = all.filter(n => n.id !== notifId);
    saveNotifications(updated);
    if (user) refreshNotifications(user.id);
  };
  
  const handleTestNotification = () => {
    if(!user) return;
    sendMockNotification(user.id, "Test Organization", "This is a test notification to verify the system is working.");
    refreshNotifications(user.id);
  };

  const getIcon = (type: string) => {
     switch(type) {
        case 'BreedingRequest': return <Mail size={18} />;
        case 'Partnership': return <Handshake size={18} />;
        case 'LoanUpdate': return <FileText size={18} />;
        default: return <Bell size={18} />;
     }
  };

  const getColor = (type: string) => {
     switch(type) {
        case 'BreedingRequest': return 'bg-purple-100 text-purple-600';
        case 'Partnership': return 'bg-emerald-100 text-emerald-600';
        case 'LoanUpdate': return 'bg-amber-100 text-amber-600';
        default: return 'bg-slate-100 text-slate-600';
     }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Notifications</h2>
          <p className="text-slate-500">Updates and requests.</p>
        </div>
        <button 
          onClick={handleTestNotification}
          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded"
        >
          Send Test Notification
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
             <Bell className="mx-auto mb-4 opacity-50" size={48} />
             <p>No notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map(n => (
              <div key={n.id} className={`p-6 flex gap-4 transition-colors ${n.isRead ? 'bg-white' : 'bg-blue-50/50'}`}>
                 <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getColor(n.type)}`}>
                    {getIcon(n.type)}
                 </div>
                 
                 <div className="flex-1">
                    <div className="flex justify-between items-start">
                       <div>
                          <h4 className={`text-sm font-bold ${n.isRead ? 'text-slate-700' : 'text-slate-900'}`}>{n.title}</h4>
                          <p className="text-xs text-slate-500 mb-1">From: {n.senderOrgName} • {n.date}</p>
                       </div>
                       {!n.isRead && (
                         <span className="w-2 h-2 rounded-full bg-blue-500 block mt-1"></span>
                       )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{n.message}</p>
                    {/* Context Actions could go here, e.g., 'View Loan' */}
                 </div>

                 <div className="flex flex-col gap-2">
                    {!n.isRead && (
                      <button 
                        onClick={() => markAsRead(n.id)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Mark as Read"
                      >
                         <Check size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => deleteNotification(n.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                       <Trash2 size={18} />
                    </button>
                 </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
