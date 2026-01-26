
import React, { useState, useEffect } from 'react';
import ScheduleView from './views/ScheduleView';
import BookingsView from './views/BookingsView';
import ExpenseView from './views/ExpenseView';
import PlanningView from './views/PlanningView';
import MembersView from './views/MembersView';
import { Modal, NordicButton } from './components/Shared';
import { membersService } from './firebaseService';
import { Member } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'schedule' | 'bookings' | 'expense' | 'planning' | 'members'>('schedule');
  const [isEditMode, setIsEditMode] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [pinInput, setPinInput] = useState('');

const [members, setMembers] = useState<Member[]>([]);

useEffect(() => {
  const unsubscribe = membersService.subscribe((membersFromDb) => {
    setMembers(
      membersFromDb.map((m) => ({
        ...m,
        avatar:
          m.avatar ||
          `https://picsum.photos/seed/${m.id}/100/100`,
      }))
    );
  });

  return () => unsubscribe();
}, []);
  
  const handleToggleLock = () => {
    if (isEditMode) {
      setIsEditMode(false);
    } else {
      setShowLockModal(true);
    }
  };

  const handleVerifyPin = () => {
    if (pinInput === '007') {
      setIsEditMode(true);
      setShowLockModal(false);
      setPinInput('');
    } else {
      alert('密碼錯誤！');
      setPinInput('');
    }
  };

const addMember = async (name: string) => {
  await membersService.add(name);
};
  
const deleteMember = async (id: string) => {
  if (members.length <= 1) {
    alert('旅程至少需要一位成員！');
    return;
  }
  await membersService.remove(id);
};

const updateMemberAvatar = (id: string, avatar: string) => {
  setMembers((prev) =>
    prev.map((m) => (m.id === id ? { ...m, avatar } : m))
  );
};
const updateMemberName = async (id: string, name: string) => {
  await membersService.updateName(id, name);
};


  const renderContent = () => {
    switch (activeTab) {
      case 'schedule': return <ScheduleView isEditMode={isEditMode} />;
      case 'bookings': return <BookingsView isEditMode={isEditMode} />;
      case 'expense': return <ExpenseView members={members} />;
      case 'planning': return <PlanningView members={members} />;
      case 'members': return (
        <MembersView 
          members={members} 
          onAddMember={addMember} 
          onUpdateAvatar={updateMemberAvatar}
          onDeleteMember={deleteMember}
          onUpdateName={updateMemberName}
          isEditMode={isEditMode}
        />
      );
      default: return <ScheduleView isEditMode={isEditMode} />;
    }
  };

  const navItems = [
    { id: 'schedule', icon: 'fa-calendar-days', label: '行程' },
    { id: 'bookings', icon: 'fa-ticket', label: '預訂' },
    { id: 'expense', icon: 'fa-wallet', label: '記帳' },
    { id: 'planning', icon: 'fa-list-check', label: '準備' },
    { id: 'members', icon: 'fa-user-group', label: '成員' }
  ];

  // 判斷當前頁面是否需要顯示鎖頭按鈕 (行程、預訂、成員清單需要)
  const showLockButton = activeTab === 'schedule' || activeTab === 'bookings' || activeTab === 'members';

  return (
    <div className="min-h-screen max-w-lg mx-auto bg-cream pb-20 overflow-x-hidden relative">
      <header className="px-4 pt-4 flex justify-end items-center h-14">
        {showLockButton ? (
          <button 
            onClick={handleToggleLock}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm border-2 ${
              isEditMode ? 'bg-stamp text-cream border-cream' : 'bg-white text-ink border-paper'
            }`}
          >
            <i className={`fa-solid ${isEditMode ? 'fa-lock-open' : 'fa-lock'}`}></i>
          </button>
        ) : (
          <div className="w-10 h-10"></div>
        )}
      </header>

      <main className="w-full overflow-x-hidden">
        {renderContent()}
      </main>

      <Modal isOpen={showLockModal} onClose={() => setShowLockModal(false)} title="啟用編輯權限">
        <div className="space-y-4 text-center overflow-x-hidden">
          <p className="text-steel text-sm font-bold">請輸入編輯密碼以開啟修改功能</p>
          <input 
            type="password" 
            value={pinInput} 
            onChange={(e) => setPinInput(e.target.value)} 
            className="w-full p-4 text-center text-3xl tracking-[0.5em] bg-white border-2 border-paper rounded-2xl focus:border-harbor transition-colors" 
            placeholder="***"
            maxLength={3} 
            autoFocus 
          />
          <NordicButton onClick={handleVerifyPin} className="w-full py-4">
            確認驗證
          </NordicButton>
        </div>
      </Modal>

      <nav className="fixed bottom-0 left-0 right-0 glass-nav z-50">
        <div className="max-w-lg mx-auto flex justify-around items-center h-20 px-4">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex flex-col items-center justify-center flex-1 transition-all duration-300 relative ${active ? 'text-harbor' : 'text-cream/40'}`}
              >
                {active && (
                  <div className="absolute top-[-12px] w-12 h-1.5 bg-harbor rounded-full animate-in fade-in zoom-in duration-300"></div>
                )}
                <i className={`fa-solid ${item.icon} text-xl mb-1 ${active ? 'scale-110' : ''}`}></i>
                <span className={`text-[10px] font-bold tracking-wider uppercase ${active ? 'opacity-100' : 'opacity-60'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default App;
