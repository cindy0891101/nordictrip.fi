import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NordicCard, NordicButton, Modal } from '../components/Shared';
import { CURRENCIES as INITIAL_CURRENCIES, CATEGORY_COLORS } from '../constants';
import { Expense, Member, ArchivedSettlement } from '../types';
import { dbService } from '../firebaseService';

interface ExpenseViewProps {
  members: Member[];
}

const ExpenseView: React.FC<ExpenseViewProps> = ({ members }) => {
  const myID = '1'; // 這裡之後可以串接 Auth UID
  
  // --- 雲端數據狀態 ---
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [archivedSettlements, setArchivedSettlements] = useState<ArchivedSettlement[]>([]);
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>(INITIAL_CURRENCIES);
  const [clearedSplits, setClearedSplits] = useState<Record<string, boolean>>({});

  // --- UI 控制狀態 ---
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showManageRates, setShowManageRates] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const [formData, setFormData] = useState({ 
    id: '', 
    amount: '', 
    currency: 'TWD', 
    note: '', 
    category: 'Food', 
    payerId: '1', 
    splitWith: members.map(m => m.id),
    date: new Date().toISOString().split('T')[0]
  });

  // --- 計算機相關 ---
  const [calcInput, setCalcInput] = useState('0');
  const [calcCurrency, setCalcCurrency] = useState('EUR');
  const [isReverseExchange, setIsReverseExchange] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>('尚未同步');

  // --- 1. Firebase 實時訂閱 (核心修正) ---
  useEffect(() => {
    // 訂閱支出
    const unsubExpenses = dbService.subscribeExpenses((data) => setExpenses(data));
    
    // 訂閱匯率 (如果有同步到雲端)
    const unsubRates = dbService.subscribeCurrencyRates?.((data) => {
      if (data && Object.keys(data).length > 0) setCurrencyRates(data);
    });

    // 訂閱結算存檔
    const unsubArchived = dbService.subscribeArchivedSettlements?.((data) => {
      setArchivedSettlements(data);
    });

    return () => {
      unsubExpenses();
      unsubRates?.();
      unsubArchived?.();
    };
  }, []);

  // --- 2. 核心計算邏輯 (金額分攤與匯率換算) ---
  const totalTeamTWD = useMemo(() => 
    expenses.reduce((acc, curr) => acc + (curr.amount * (currencyRates[curr.currency] || 1)), 0)
  , [expenses, currencyRates]);

  const settlementPlans = useMemo(() => {
    const balances: Record<string, number> = {};
    members.forEach(m => balances[m.id] = 0);
    
    expenses.forEach(exp => {
      const rate = currencyRates[exp.currency] || 1;
      const amountInTwd = exp.amount * rate;
      const share = amountInTwd / exp.splitWith.length;
      
      exp.splitWith.forEach(id => {
        if (id !== exp.payerId) {
          balances[exp.payerId] += share;
          balances[id] -= share;
        }
      });
    });

    archivedSettlements.forEach(arch => {
      balances[arch.from] += arch.amount; 
      balances[arch.to] -= arch.amount;   
    });

    let creditors = members.map(m => ({ id: m.id, name: m.name, balance: balances[m.id] })).filter(m => m.balance > 0.5).sort((a, b) => b.balance - a.balance);
    let debtors = members.map(m => ({ id: m.id, name: m.name, balance: balances[m.id] })).filter(m => m.balance < -0.5).sort((a, b) => a.balance - b.balance);
    
    const activePlans: any[] = [];
    let i = 0, j = 0;
    const tempCreditors = creditors.map(c => ({ ...c }));
    const tempDebtors = debtors.map(d => ({ ...d }));

    while (i < tempCreditors.length && j < tempDebtors.length) {
      const amount = Math.min(tempCreditors[i].balance, Math.abs(tempDebtors[j].balance));
      activePlans.push({ from: tempDebtors[j].id, to: tempCreditors[i].id, amount, key: `${tempDebtors[j].id}-${tempCreditors[i].id}` });
      tempCreditors[i].balance -= amount;
      tempDebtors[j].balance += amount;
      if (tempCreditors[i].balance < 0.5) i++;
      if (Math.abs(tempDebtors[j].balance) < 0.5) j++;
    }
    return activePlans;
  }, [expenses, members, currencyRates, archivedSettlements]);

  // --- 3. 雲端操作 Action ---
  const handleSave = async (isEdit: boolean) => {
    if (!formData.amount || formData.splitWith.length === 0) return;
    const data: any = {
      ...formData,
      amount: parseFloat(formData.amount),
      id: isEdit ? formData.id : Date.now().toString(),
      addedBy: myID
    };
    try {
      await dbService.saveExpense(data);
      isEdit ? setShowEdit(false) : setShowAdd(false);
    } catch (err) { alert("儲存失敗，請檢查連線"); }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("確定刪除此筆支出紀錄？")) {
      await dbService.deleteExpense(id);
      setShowDetail(false);
    }
  };

  const toggleSplitMember = (id: string) => {
    const nextSplit = formData.splitWith.includes(id) 
      ? formData.splitWith.filter(i => i !== id) 
      : [...formData.splitWith, id];
    setFormData({ ...formData, splitWith: nextSplit });
  };

  const handleArchive = async (plan: any) => {
    const newArchived: ArchivedSettlement = {
      id: Date.now().toString(),
      from: plan.from,
      to: plan.to,
      amount: plan.amount,
      date: new Date().toLocaleDateString()
    };
    await dbService.saveArchivedSettlement?.(newArchived);
  };

  const handleUnarchive = async (id: string) => {
    await dbService.deleteArchivedSettlement?.(id);
  };

  // --- 4. 輔助 UI 函式 ---
  const getCategoryIcon = (cat: string) => {
    const icons: Record<string, string> = { Food: 'fa-utensils', Transport: 'fa-car-side', Shopping: 'fa-bag-shopping', Hotel: 'fa-bed', Ticket: 'fa-train', Activity: 'fa-star' };
    return icons[cat] || 'fa-tags';
  };

  const calcResult = useMemo(() => {
    const rate = currencyRates[calcCurrency] || 1;
    const num = parseFloat(calcInput) || 0;
    return isReverseExchange ? (num / rate).toFixed(2) : (num * rate).toFixed(2);
  }, [calcInput, calcCurrency, isReverseExchange, currencyRates]);

  return (
    <div className="pb-24 px-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
      <div className="pt-6">
        <h1 className="text-3xl font-bold text-sage tracking-tight">記帳本</h1>
        <p className="text-earth-dark mt-1 font-bold">雲端即時記帳，精準分攤</p>
      </div>

      <NordicCard className="bg-[#E6D5C3] p-6 border-none nordic-shadow relative overflow-hidden">
        <div className="relative z-10 space-y-5">
          <div>
            <span className="text-[11px] text-sage font-bold uppercase tracking-[0.15em] opacity-80">團隊總支出</span>
            <div className="text-3xl font-bold text-[#5C4D3C] mt-1">NT$ {Math.round(totalTeamTWD).toLocaleString()}</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowSettlement(true)} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-handshake-angle text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">結算</span></button>
            <button onClick={() => setShowCalc(true)} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-calculator text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">換算</span></button>
            <button onClick={() => setShowChart(true)} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-chart-pie text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">分析</span></button>
          </div>
        </div>
      </NordicCard>

      <NordicButton 
        onClick={() => {
          setFormData({ ...formData, id: '', amount: '', note: '', date: new Date().toISOString().split('T')[0], splitWith: members.map(m => m.id) });
          setShowAdd(true);
        }} 
        className="w-full h-14 bg-sage border-none shadow-lg"
      >
        <i className="fa-solid fa-plus mr-2"></i> 新增支出
      </NordicButton>

      {/* 支出列表 */}
      <div className="space-y-3">
        {expenses.length === 0 ? (
          <div className="py-16 text-center text-earth-dark/40 italic font-bold uppercase tracking-widest opacity-40">尚無紀錄</div>
        ) : (
          expenses.map(exp => (
            <div key={exp.id} onClick={() => { setSelectedExpense(exp); setShowDetail(true); }} className="bg-white p-4 rounded-3xl border border-slate flex justify-between items-center shadow-sm active:bg-cream/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${CATEGORY_COLORS[exp.category] || 'bg-slate'}`}>
                  <i className={`fa-solid ${getCategoryIcon(exp.category)}`}></i>
                </div>
                <div>
                  <h4 className="font-bold text-sage text-sm">{exp.note || '項目名稱'}</h4>
                  <p className="text-[9px] font-bold text-earth-dark uppercase tracking-wider">{members.find(m => m.id === exp.payerId)?.name} 代墊</p>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sage text-sm">{exp.currency} {exp.amount.toLocaleString()}</div>
                <div className="text-[8px] font-bold text-earth-dark/40">{exp.date}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 新增/編輯彈窗 */}
      <Modal isOpen={showAdd || showEdit} onClose={() => { setShowAdd(false); setShowEdit(false); }} title={showEdit ? "修改支出" : "新增一筆支出"}>
        <div className="space-y-4 pb-12">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-earth-dark uppercase pl-1">金額</label>
              <input type="number" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full p-4 bg-white border-2 border-slate rounded-2xl font-bold text-sage" placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-earth-dark uppercase pl-1">幣別</label>
              <select value={formData.currency} onChange={e => setFormData({...formData, currency: e.target.value})} className="w-full p-4 bg-white border-2 border-slate rounded-2xl font-bold text-sage outline-none">
                {Object.keys(currencyRates).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-earth-dark uppercase pl-1">項目備註</label>
            <input type="text" value={formData.note} onChange={e => setFormData({...formData, note: e.target.value})} className="w-full p-4 bg-white border-2 border-slate rounded-2xl font-bold text-sage" placeholder="例如：藥妝採買" />
          </div>
          
          <div className="space-y-3">
             <div className="flex justify-between items-center px-1">
               <label className="text-[10px] font-bold text-earth-dark uppercase tracking-widest">分攤成員</label>
               <button onClick={() => setFormData({...formData, splitWith: members.map(m => m.id)})} className="text-[10px] font-bold text-sage underline opacity-60 uppercase">快速全選</button>
             </div>
             <div className="grid grid-cols-2 gap-2">
               {members.map(m => (
                 <button key={m.id} onClick={() => toggleSplitMember(m.id)} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${formData.splitWith.includes(m.id) ? 'border-sage bg-sage/5 text-sage' : 'border-slate bg-white text-earth opacity-40'}`}>
                   <img src={m.avatar} className="w-7 h-7 rounded-full" alt="avatar" />
                   <span className="text-xs font-bold">{m.name}</span>
                 </button>
               ))}
             </div>
          </div>
          <NordicButton onClick={() => handleSave(showEdit)} className="w-full py-5 bg-sage text-white shadow-xl mt-4">確認儲存</NordicButton>
        </div>
      </Modal>

      {/* 結算 Modal */}
      <Modal isOpen={showSettlement} onClose={() => setShowSettlement(false)} title="還款計畫">
        <div className="space-y-6 pb-8">
           <div className="space-y-3">
             <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest opacity-60 mb-2">待處理 (點擊結清)</p>
             {settlementPlans.map(plan => (
               <div key={plan.key} onClick={() => handleArchive(plan)} className="bg-white p-4 rounded-2xl border-2 border-sage flex items-center justify-between active:scale-95 cursor-pointer shadow-sm">
                  <div className="text-center"><img src={members.find(m => m.id === plan.from)?.avatar} className="w-8 h-8 rounded-full border mb-1" /><span className="text-[10px] font-bold">{members.find(m => m.id === plan.from)?.name}</span></div>
                  <div className="flex-grow flex flex-col items-center"><span className="text-sm font-bold text-terracotta">NT$ {Math.round(plan.amount).toLocaleString()}</span><div className="w-1/2 h-[1px] bg-slate/30 mt-1"></div></div>
                  <div className="text-center"><img src={members.find(m => m.id === plan.to)?.avatar} className="w-8 h-8 rounded-full border mb-1" /><span className="text-[10px] font-bold">{members.find(m => m.id === plan.to)?.name}</span></div>
               </div>
             ))}
           </div>
           
           {archivedSettlements.length > 0 && (
             <div className="pt-4 border-t border-slate/50 space-y-3">
               <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest opacity-40 mb-2">已結清歷史 (點擊撤銷)</p>
               {archivedSettlements.map(arch => (
                 <div key={arch.id} onClick={() => handleUnarchive(arch.id)} className="bg-slate/10 p-4 rounded-2xl border border-slate flex items-center justify-between opacity-50 grayscale cursor-pointer">
                    <span className="text-[10px] font-bold">{members.find(m => m.id === arch.from)?.name}</span>
                    <span className="text-xs font-bold line-through">NT$ {Math.round(arch.amount).toLocaleString()}</span>
                    <span className="text-[10px] font-bold">{members.find(m => m.id === arch.to)?.name}</span>
                 </div>
               ))}
             </div>
           )}
        </div>
      </Modal>

      {/* 詳情 Modal */}
      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title="支出詳情">
        {selectedExpense && (
          <div className="space-y-6 pb-12">
            <div className="text-center p-8 bg-cream/30 rounded-3xl border-2 border-dashed border-slate">
              <div className="text-3xl font-bold text-sage">{selectedExpense.currency} {selectedExpense.amount.toLocaleString()}</div>
              <div className="text-xs font-bold text-earth-dark/50 mt-1">≈ NT$ {Math.round(selectedExpense.amount * (currencyRates[selectedExpense.currency] || 1)).toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setFormData({...selectedExpense, amount: selectedExpense.amount.toString()}); setShowEdit(true); setShowDetail(false); }} className="py-4 rounded-2xl bg-sage/10 text-sage font-bold text-xs">修改</button>
              <button onClick={() => handleDelete(selectedExpense.id)} className="py-4 rounded-2xl bg-terracotta/10 text-terracotta font-bold text-xs">刪除</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ExpenseView;
