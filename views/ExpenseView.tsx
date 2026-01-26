import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { NordicCard, NordicButton, Modal } from '../components/Shared';
import { CURRENCIES as INITIAL_CURRENCIES, CATEGORY_COLORS } from '../constants';
import { Expense, Member } from '../types';
import { dbService } from '../firebaseService';

interface ArchivedSettlement {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: string;
}

interface ExpenseViewProps {
  members: Member[];
}

const ExpenseView: React.FC<ExpenseViewProps> = ({ members }) => {
  const myID = '1';
  
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showManageRates, setShowManageRates] = useState(false);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showChart, setShowChart] = useState(false);

  
  const [clearedSplits, setClearedSplits] = useState<Record<string, boolean>>({});

  const [archivedSettlements, setArchivedSettlements] = useState<ArchivedSettlement[]>([]);

  const [selectedCategoryForAnalysis, setSelectedCategoryForAnalysis] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string>('同步中');

  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('nordic_currency_rates');
    return saved ? JSON.parse(saved) : INITIAL_CURRENCIES;
  });

  // 保存匯率變動
  useEffect(() => {
    localStorage.setItem('nordic_currency_rates', JSON.stringify(currencyRates));
  }, [currencyRates]);

  useEffect(() => {
    localStorage.setItem('nordic_last_sync', lastSync);
    localStorage.setItem('nordic_cleared_splits', JSON.stringify(clearedSplits));
    localStorage.setItem('nordic_archived_settlements', JSON.stringify(archivedSettlements));
  }, [lastSync, clearedSplits, archivedSettlements]);

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

  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  
  // 計算機狀態
  const [calcInput, setCalcInput] = useState('0');
  const [calcCurrency, setCalcCurrency] = useState('EUR');
  const [isReverseExchange, setIsReverseExchange] = useState(false); 
  const [calcPrev, setCalcPrev] = useState<number | null>(null);
  const [calcOp, setCalcOp] = useState<string | null>(null);
  const [shouldReset, setShouldReset] = useState(false);

  const [newRateCode, setNewRateCode] = useState('');
  const [newRateValue, setNewRateValue] = useState('');

  const syncAllRates = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/TWD');
      const data = await response.json();
      if (data.result === 'success') {
        const apiRates = data.rates;
        setCurrencyRates(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(code => {
            if (code === 'TWD') return;
            if (apiRates[code]) {
              next[code] = parseFloat((1 / apiRates[code]).toFixed(4));
            }
          });
          return next;
        });
        setLastSync(new Date().toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
      }
    } catch (e) {
      console.warn("無法取得即時匯率");
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    if (showCalc) syncAllRates();
  }, [showCalc, syncAllRates]);

  const handleDeleteRate = (code: string) => {
    if (code === 'TWD') return; 
    setCurrencyRates(prev => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    if (calcCurrency === code) setCalcCurrency('TWD');
  };

  const performCalculation = (a: number, b: number, op: string) => {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 ? a / b : a;
      default: return b;
    }
  };

  const handleKeypad = (key: string) => {
    if (['+', '-', '*', '/'].includes(key)) {
      const currentVal = parseFloat(calcInput) || 0;
      if (calcPrev !== null && calcOp) {
        const result = performCalculation(calcPrev, currentVal, calcOp);
        setCalcPrev(result);
        setCalcInput(result.toString());
      } else {
        setCalcPrev(currentVal);
      }
      setCalcOp(key);
      setShouldReset(true);
    } else if (key === '=') {
      if (calcPrev !== null && calcOp) {
        const result = performCalculation(calcPrev, parseFloat(calcInput) || 0, calcOp);
        setCalcInput(result.toString());
        setCalcPrev(null);
        setCalcOp(null);
        setShouldReset(true);
      }
    } else if (key === 'AC') {
      setCalcInput('0');
      setCalcPrev(null);
      setCalcOp(null);
      setShouldReset(false);
    } else if (key === 'DEL') {
      setCalcInput(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else {
      setCalcInput(prev => {
        if (shouldReset) {
          setShouldReset(false);
          return key === '.' ? '0.' : key;
        }
        if (key === '.') return prev.includes('.') ? prev : prev + '.';
        return prev === '0' ? key : prev + key;
      });
    }
  };

  const chartData = useMemo(() => {
    if (expenses.length === 0) return [];
    const stats: Record<string, number> = {};
    let totalTwd = 0;
    expenses.forEach(exp => {
      const rate = currencyRates[exp.currency] || 1;
      const twdAmount = exp.amount * rate;
      stats[exp.category] = (stats[exp.category] || 0) + twdAmount;
      totalTwd += twdAmount;
    });
    let cumulativePercent = 0;
    return Object.entries(stats)
      .map(([cat, amount]) => {
        const fraction = amount / totalTwd;
        const startPercent = cumulativePercent;
        cumulativePercent += fraction;
        return {
          category: cat, 
          amount, 
          fraction,
          percent: (fraction * 100).toFixed(1),
          startPercent, 
          endPercent: cumulativePercent,
          color: CATEGORY_COLORS[cat] || 'bg-slate'
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, currencyRates]);

  const categoryDetails = useMemo(() => {
    if (!selectedCategoryForAnalysis) return [];
    return expenses
      .filter(exp => exp.category === selectedCategoryForAnalysis)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedCategoryForAnalysis]);

  const settlementPlans = useMemo(() => {
    const balances: Record<string, number> = {};
    members.forEach(m => balances[m.id] = 0);
    
    expenses.forEach(exp => {
      const rate = currencyRates[exp.currency] || 1;
      const amountInTwd = exp.amount * rate;
      const share = amountInTwd / exp.splitWith.length;
      
      exp.splitWith.forEach(id => {
        const splitKey = `${exp.id}-${id}`;
        if (!clearedSplits[splitKey] && id !== exp.payerId) {
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
    
    const activePlans: { from: string, to: string, amount: number, key: string }[] = [];
    let cIdx = 0, dIdx = 0;
    const tempCreditors = creditors.map(c => ({ ...c }));
    const tempDebtors = debtors.map(d => ({ ...d }));

    while (cIdx < tempCreditors.length && dIdx < tempDebtors.length) {
      const creditor = tempCreditors[cIdx], debtor = tempDebtors[dIdx];
      const amount = Math.min(creditor.balance, Math.abs(debtor.balance));
      activePlans.push({ from: debtor.id, to: creditor.id, amount, key: `${debtor.id}-${creditor.id}` });
      creditor.balance -= amount;
      debtor.balance += amount;
      if (creditor.balance < 0.5) cIdx++;
      if (Math.abs(debtor.balance) < 0.5) dIdx++;
    }
    return activePlans;
  }, [expenses, members, currencyRates, clearedSplits, archivedSettlements]);

 const handleArchiveSettlement = async (plan: { from: string, to: string, amount: number }) => {
    const newArchived: ArchivedSettlement = {
      id: Date.now().toString(),
      from: plan.from,
      to: plan.to,
      amount: plan.amount,
      date: new Date().toLocaleDateString()
    };

    try {
      // ✅ 1. 呼叫雲端服務儲存結算紀錄
      await dbService.saveArchivedSettlement(newArchived);
      
      // ✅ 2. 同時，你可能需要「清空」目前的支出帳目（這取決於你的邏輯）
      // 如果你的邏輯是結算後就刪除所有舊帳，可以在這裡處理
      
      // 不需要手動 setArchivedSettlements，因為 useEffect 會監聽雲端並更新
    } catch (error) {
      console.error("結算存檔失敗:", error);
      alert("雲端同步失敗，請檢查網路連線");
    }
  };

const handleUnarchiveSettlement = async (id: string) => {
    // 加上確認視窗，防止誤點
    if (!window.confirm("確定要刪除這筆結算紀錄嗎？")) return;

    try {
      // ✅ 改為呼叫雲端服務進行刪除
      // 假設你的 dbService 裡有 deleteArchivedSettlement 這個方法
      await dbService.deleteArchivedSettlement(id);
      
      // 不需要手動 setArchivedSettlements，
      // 因為雲端刪除後，你的 useEffect 監聽器會收到通知並自動更新畫面。
    } catch (error) {
      console.error("刪除結算紀錄失敗:", error);
      alert("雲端同步失敗，請檢查網路連線");
    }
  };

const toggleClearedSplit = async (expenseId: string, memberId: string) => {
    const key = `${expenseId}-${memberId}`;
    
    // 1. 算出新的狀態
    const newClearedSplits = { 
      ...clearedSplits, 
      [key]: !clearedSplits[key] 
    };

    try {
      // 2. 存入雲端 (假設 dbService 有 saveClearedSplits 方法)
      await dbService.saveClearedSplits(newClearedSplits);
      
      // 注意：這裡不需要手動 setClearedSplits，
      // 我們應該在 useEffect 裡監聽這個狀態。
    } catch (error) {
      console.error("更新結清狀態失敗:", error);
    }
  };

useEffect(() => {
  // 監聽支出
const unsubExpenses = dbService.subscribeExpenses((data) => {
    console.log("收到雲端支出更新，最新筆數：", data.length);
    // ✅ 關鍵：使用展開運算子 [...] 建立新物件，強制 React 刷新畫面
    setExpenses([...data]); 
  });

  return () => unsubExpenses();
}, []);
  
  // 監聽結算
  const unsubArchived = dbService.subscribeArchivedSettlements((data) => {
    setArchivedSettlements(data);
  });

  // 監聽勾選狀態 (如果 dbService 有支援)
  const unsubCleared = dbService.subscribeClearedSplits?.((data) => {
    if (data) setClearedSplits(data);
  });

  return () => {
    unsubExpenses();
    unsubArchived();
    unsubCleared?.();
  };
}, []);
  const toggleSplitMember = (id: string) => {
    if (formData.splitWith.includes(id)) {
      setFormData({ ...formData, splitWith: formData.splitWith.filter(i => i !== id) });
    } else {
      setFormData({ ...formData, splitWith: [...formData.splitWith, id] });
    }
  };

  const handleDeleteExpense = async (id: string) => {
  if (!window.confirm("確定要刪除這筆支出嗎？")) return;

  try {
    // 1. 呼叫 Firebase 刪除
    await dbService.deleteExpense(id);
    
    // 2. 關閉編輯視窗
    setShowEdit(false);
    
    // 💡 再次提醒：這裡不需要 setExpenses，因為 useEffect 的 subscribe 會自動同步更新畫面
    console.log("✅ 雲端刪除成功");
  } catch (error) {
    console.error("❌ 刪除失敗:", error);
    alert("雲端同步失敗");
  }
};
  
  const handleAddExpense = async () => { // 1. 加上 async
    if (!formData.amount || formData.splitWith.length === 0) return;
    const exp: Expense = {
      id: Date.now().toString(),
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      category: formData.category,
      payerId: formData.payerId,
      splitWith: formData.splitWith,
      addedBy: myID,
      date: formData.date || new Date().toISOString().split('T')[0],
      note: formData.note
    };
    try {
    // 2. 呼叫雲端服務存檔，刪除原本的 setExpenses
    await dbService.saveExpense(exp); 
    
    // 3. 成功後關閉視窗與清空表單
    setShowAdd(false);
    setFormData({ 
      ...formData, 
      amount: '', 
      note: '', 
      id: '' 
    });
  } catch (error) {
    console.error("儲存失敗:", error);
    alert("雲端同步失敗，請檢查網路連線");
}
};

  const handleUpdateExpense = async () => {
    if (!formData.amount || formData.splitWith.length === 0) return;
// 準備更新後的資料
    const updatedExpense: Expense = {
      ...formData,
      amount: parseFloat(formData.amount),
      // 確保 ID 保持不變，這樣 Firebase 才會執行「覆蓋更新」而不是「新增」
      id: formData.id, 
      updatedAt: new Date() // 可以加上更新時間戳記
    } as Expense;

    try {
      // ✅ 呼叫雲端服務進行更新
      await dbService.saveExpense(updatedExpense);
      
      // ✅ 成功後關閉視窗
      setShowEdit(false);
      // 清空表單
      setFormData({ ...formData, id: '', amount: '', note: '' });
    } catch (error) {
      console.error("更新失敗:", error);
      alert("雲端更新失敗");
    }
  };

  const startEdit = (exp: Expense) => {
    setFormData({
      id: exp.id,
      amount: exp.amount.toString(),
      currency: exp.currency,
      note: exp.note,
      category: exp.category,
      payerId: exp.payerId,
      splitWith: exp.splitWith,
      date: exp.date
    });
    setShowEdit(true);
  };

  const totalTeamTWD = useMemo(() => 
    expenses.reduce((acc, curr) => acc + (curr.amount * (currencyRates[curr.currency] || 1)), 0)
  , [expenses, currencyRates]);

  const getCoordinatesForPercent = (percent: number, radius: number = 1) => {
    const x = radius * Math.cos(2 * Math.PI * percent);
    const y = radius * Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = { Food: '餐飲', Transport: '交通', Shopping: '採買', Hotel: '住宿', Ticket: '交通票', Activity: '玩樂', Accommodation: '住宿', Attraction: '景點' };
    return labels[cat] || cat;
  };

  const getCategoryIcon = (cat: string) => {
    const icons: Record<string, string> = { Food: 'fa-utensils', Transport: 'fa-car-side', Shopping: 'fa-bag-shopping', Hotel: 'fa-bed', Ticket: 'fa-train', Activity: 'fa-star', Accommodation: 'fa-hotel', Attraction: 'fa-camera' };
    return icons[cat] || 'fa-tags';
  };

  const sliceColorMap: Record<string, string> = {
    'bg-morandi-blue': '#B6C1C9', 
    'bg-morandi-pink': '#D8B4A0', 
    'bg-sage': '#A3A380', 
    'bg-terracotta': '#D4A373', 
    'bg-[#9BA4B5]': '#9BA4B5', 
    'bg-[#B4846C]': '#B4846C' 
  };

  const calcResult = useMemo(() => {
    const rate = currencyRates[calcCurrency] || 1;
    const inputNum = parseFloat(calcInput) || 0;
    if (isReverseExchange) {
      return (inputNum / rate).toFixed(2);
    } else {
      return (inputNum * rate).toFixed(2);
    }
  }, [calcInput, calcCurrency, isReverseExchange, currencyRates]);

  const handleAddNewRate = () => {
    if (!newRateCode || !newRateValue) return;
    const code = newRateCode.toUpperCase();
    const rate = parseFloat(newRateValue);
    if (isNaN(rate)) return;
    
    setCurrencyRates(prev => ({
      ...prev,
      [code]: rate
    }));
    setNewRateCode('');
    setNewRateValue('');
  };

  return (
    <div className="pb-24 px-4 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-x-hidden">
      <div className="pt-6">
        <h1 className="text-3xl font-bold text-sage tracking-tight">記帳本</h1>
        <p className="text-earth-dark mt-1 font-bold">聰明記帳，讓旅行更輕鬆</p>
      </div>

      <NordicCard className="bg-[#E6D5C3] p-6 border-none relative overflow-hidden nordic-shadow">
        <div className="relative z-10 space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[11px] text-sage font-bold uppercase tracking-[0.15em] opacity-80">團隊總支出</span>
              <div className="text-3xl font-bold text-[#5C4D3C] mt-1">NT$ {Math.round(totalTeamTWD).toLocaleString()}</div>
            </div>
            <div className="bg-white/40 p-2 rounded-2xl"><i className="fa-solid fa-coins text-[#5C4D3C] text-xl"></i></div>
          </div>
          <div className="bg-[#5C4D3C] rounded-2xl p-4 flex justify-between items-center shadow-lg">
            <span className="text-xs text-[#E6D5C3] font-bold uppercase tracking-wider">結算狀態</span>
            <div className="text-lg font-bold text-white">共 {expenses.length} 筆紀錄</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setShowSettlement(true)} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-handshake-angle text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">結算</span></button>
            <button onClick={() => setShowCalc(true)} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-calculator text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">換算</span></button>
            <button onClick={() => { setSelectedCategoryForAnalysis(null); setShowChart(true); }} className="bg-white/50 py-3 rounded-xl flex flex-col items-center active:scale-95 transition-all"><i className="fa-solid fa-chart-pie text-[#5C4D3C] mb-1"></i><span className="text-[10px] text-[#5C4D3C] font-bold">分析</span></button>
          </div>
        </div>
      </NordicCard>

      <NordicButton 
        onClick={() => {
          setFormData({ ...formData, amount: '', note: '', date: new Date().toISOString().split('T')[0] });
          setShowAdd(true);
        }} 
        className="w-full h-14 bg-sage border-none"
      >
        <i className="fa-solid fa-plus"></i> 新增一筆支出
      </NordicButton>

      <div className="space-y-3">
        {expenses.length === 0 ? (
          <div className="py-16 text-center text-earth-dark/40 italic flex flex-col items-center font-bold tracking-widest uppercase opacity-40">尚未有任何花費紀錄</div>
        ) : (
          expenses.map(exp => (
            <div key={exp.id} onClick={() => { setSelectedExpense(exp); setShowDetail(true); }} className="bg-white p-4 rounded-3xl border border-slate flex justify-between items-center shadow-sm relative group active:bg-cream/50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white ${CATEGORY_COLORS[exp.category] || 'bg-slate'}`}>
                  <i className={`fa-solid ${getCategoryIcon(exp.category)}`}></i>
                </div>
                <div>
                  <h4 className="font-bold text-sage text-sm">{exp.note || '支出'}</h4>
                  <p className="text-[9px] font-bold text-earth-dark uppercase tracking-wider">{members.find(m => m.id === exp.payerId)?.name} 代墊</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right flex flex-col justify-center">
                  <div className="font-bold text-sage text-sm">{exp.currency} {exp.amount.toLocaleString()}</div>
                  <div className="text-[8px] font-bold text-earth-dark/40 uppercase tracking-widest">{exp.date}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); startEdit(exp); }} className="w-8 h-8 rounded-full bg-cream text-sage flex items-center justify-center active:scale-90"><i className="fa-solid fa-pen-to-square text-[10px]"></i></button>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal isOpen={showSettlement} onClose={() => setShowSettlement(false)} title="團隊還款計畫">
        <div className="space-y-6 pb-6 px-1 max-h-[70vh] overflow-y-auto no-scrollbar">
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-bold text-earth-dark uppercase tracking-widest">待處理還款</span>
              <span className="text-[10px] font-bold text-sage opacity-70">點擊標記還清</span>
            </div>
            
            {settlementPlans.length > 0 ? settlementPlans.map((plan) => (
              <div 
                key={plan.key} 
                onClick={() => handleArchiveSettlement(plan)} 
                className="bg-white p-4 rounded-2xl border-2 border-sage flex items-center gap-3 active:scale-[0.98] cursor-pointer transition-all shadow-sm hover:shadow-md"
              >
                <div className="flex flex-col items-center gap-1 min-w-[50px]">
                  <img src={members.find(m => m.id === plan.from)?.avatar} className="w-8 h-8 rounded-full border border-slate" alt="debtor" />
                  <span className="text-[10px] font-bold text-earth-dark">{members.find(m => m.id === plan.from)?.name}</span>
                </div>
                <div className="flex-grow flex flex-col items-center">
                  <div className="font-bold text-sm mb-1 text-terracotta tracking-tight">
                    NT$ {Math.round(plan.amount).toLocaleString()}
                  </div>
                  <div className="w-full h-px bg-slate relative">
                    <i className="fa-solid fa-chevron-right absolute right-0 top-1/2 -translate-y-1/2 text-[8px] text-slate"></i>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 min-w-[50px]">
                  <img src={members.find(m => m.id === plan.to)?.avatar} className="w-8 h-8 rounded-full border border-slate" alt="creditor" />
                  <span className="text-[10px] font-bold text-earth-dark">{members.find(m => m.id === plan.to)?.name}</span>
                </div>
              </div>
            )) : (
              <div className="py-8 bg-cream/30 rounded-2xl border-2 border-dashed border-slate text-center text-[10px] font-bold text-earth-dark/40 uppercase tracking-widest">
                目前沒有新的欠帳
              </div>
            )}
          </div>

          {archivedSettlements.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-slate/50">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-bold text-earth-dark uppercase tracking-widest opacity-60">已完成紀錄 (點擊可撤銷)</span>
              </div>
              
              {archivedSettlements.map((arch) => (
                <div 
                  key={arch.id} 
                  onClick={() => handleUnarchiveSettlement(arch.id)} 
                  className="bg-slate/10 p-4 rounded-2xl border border-slate flex items-center gap-3 opacity-50 grayscale transition-all active:scale-[0.98] cursor-pointer"
                >
                  <div className="flex flex-col items-center gap-1 min-w-[50px]">
                    <img src={members.find(m => m.id === arch.from)?.avatar} className="w-7 h-7 rounded-full border border-slate" alt="past-debtor" />
                    <span className="text-[9px] font-bold text-earth-dark">{members.find(m => m.id === arch.from)?.name}</span>
                  </div>
                  <div className="flex-grow flex flex-col items-center">
                    <div className="font-bold text-xs mb-1 text-earth line-through">
                      NT$ {Math.round(arch.amount).toLocaleString()}
                    </div>
                    <div className="text-[8px] font-bold text-sage bg-white/60 px-2 py-0.5 rounded-full uppercase tracking-widest">已結清</div>
                  </div>
                  <div className="flex flex-col items-center gap-1 min-w-[50px]">
                    <img src={members.find(m => m.id === arch.to)?.avatar} className="w-7 h-7 rounded-full border border-slate" alt="past-creditor" />
                    <span className="text-[9px] font-bold text-earth-dark">{members.find(m => m.id === arch.to)?.name}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <NordicButton onClick={() => setShowSettlement(false)} className="w-full py-4 bg-sage text-white font-bold mt-4">返回記帳本</NordicButton>
        </div>
      </Modal>

      <Modal isOpen={showCalc} onClose={() => setShowCalc(false)} title="匯率換算計算機">
        <div className="space-y-4 pb-2 px-1 flex flex-col items-center bg-transparent max-h-full">
          <div className="w-full text-center text-[9px] font-bold text-earth-dark/50 uppercase tracking-[0.2em]">
            匯率最後更新: {lastSync}
          </div>
          
          <div className="w-full bg-cream border-2 border-slate rounded-4xl p-5 nordic-shadow relative">
            <div className="flex justify-between items-center gap-2 mb-3 h-6">
              {/* 輸入標籤 */}
              <div className="flex-1 flex items-center gap-2">
                {!isReverseExchange ? (
                  <select 
                    value={calcCurrency} 
                    onChange={(e) => setCalcCurrency(e.target.value)} 
                    className="bg-white border-2 border-slate rounded-xl px-2 py-0.5 text-[9px] font-bold text-sage outline-none shadow-sm h-6"
                  >
                    {Object.keys(currencyRates).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <span className="bg-slate/40 text-sage px-2 py-0.5 rounded-xl text-[9px] font-bold shadow-sm h-6 flex items-center">TWD</span>
                )}
                <span className="text-[8px] font-bold text-earth-dark/40 uppercase tracking-tighter">輸入</span>
              </div>
              
              {/* 切換按鈕對齊標籤文字 */}
              <div className="flex flex-col items-center px-1 relative z-20">
                <button 
                  onClick={() => setIsReverseExchange(!isReverseExchange)}
                  className="w-5 h-5 rounded-full bg-white border border-sage text-sage flex items-center justify-center shadow-md active:rotate-180 transition-all duration-300"
                >
                  <i className="fa-solid fa-right-left text-[7px]"></i>
                </button>
              </div>
              
              {/* 換算標籤 */}
              <div className="flex-1 flex items-center justify-end gap-2 text-right">
                <span className="text-[8px] font-bold text-earth-dark/40 uppercase tracking-tighter">換算</span>
                {isReverseExchange ? (
                  <select 
                    value={calcCurrency} 
                    onChange={(e) => setCalcCurrency(e.target.value)} 
                    className="bg-white border-2 border-slate rounded-xl px-2 py-0.5 text-[9px] font-bold text-sage outline-none shadow-sm h-6"
                  >
                    {Object.keys(currencyRates).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <span className="bg-slate/40 text-sage px-2 py-0.5 rounded-xl text-[9px] font-bold shadow-sm h-6 flex items-center">TWD</span>
                )}
              </div>
            </div>

            {/* 數值區：結果側 flex-1 讓 ≈ 可以往左靠 */}
            <div className="flex justify-between items-end gap-3">
              <div className="text-2xl font-bold text-sage truncate flex-shrink-0 leading-none tracking-tight">{calcInput}</div>
              <div className="text-2xl font-bold text-terracotta flex-1 text-right truncate leading-none tracking-tight min-w-0">
                <span className="text-lg opacity-40 mr-1.5 font-normal">≈</span>
                {calcResult}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 w-full max-w-[320px]">
            <button onClick={() => handleKeypad('AC')} className="h-11 rounded-xl bg-terracotta text-white font-bold text-sm shadow-sm active:scale-95">AC</button>
            <button onClick={() => handleKeypad('DEL')} className="h-11 rounded-xl bg-terracotta text-white font-bold text-sm shadow-sm active:scale-95"><i className="fa-solid fa-delete-left"></i></button>
            <button onClick={() => handleKeypad('/')} className="h-11 rounded-xl bg-sage/20 border border-sage text-sage font-bold text-lg shadow-sm active:scale-95">÷</button>
            <button onClick={() => handleKeypad('*')} className="h-11 rounded-xl bg-sage/20 border border-sage text-sage font-bold text-lg shadow-sm active:scale-95">×</button>
            
            {['7', '8', '9'].map(n => <button key={n} onClick={() => handleKeypad(n)} className="h-11 rounded-xl bg-white border border-slate text-sage font-bold text-lg shadow-sm active:scale-95">{n}</button>)}
            <button onClick={() => handleKeypad('-')} className="h-11 rounded-xl bg-sage/20 border border-sage text-sage font-bold text-lg shadow-sm active:scale-95">−</button>
            
            {['4', '5', '6'].map(n => <button key={n} onClick={() => handleKeypad(n)} className="h-11 rounded-xl bg-white border border-slate text-sage font-bold text-lg shadow-sm active:scale-95">{n}</button>)}
            <button onClick={() => handleKeypad('+')} className="h-11 rounded-xl bg-sage/20 border border-sage text-sage font-bold text-lg shadow-sm active:scale-95">+</button>
            
            {['1', '2', '3'].map(n => <button key={n} onClick={() => handleKeypad(n)} className="h-11 rounded-xl bg-white border border-slate text-sage font-bold text-lg shadow-sm active:scale-95">{n}</button>)}
            <button onClick={() => handleKeypad('=')} className="h-11 rounded-xl bg-sage text-white font-bold text-lg shadow-sm active:scale-95">=</button>

            <button onClick={() => handleKeypad('0')} className="h-11 rounded-xl bg-white border border-slate text-sage font-bold text-lg shadow-sm active:scale-95">0</button>
            <button onClick={() => handleKeypad('.')} className="h-11 rounded-xl bg-white border border-slate text-sage font-bold text-lg shadow-sm active:scale-95">.</button>
            <button onClick={() => setShowManageRates(true)} className="h-11 rounded-xl bg-sage/10 text-sage font-bold text-[10px] flex items-center justify-center active:scale-95 border border-sage/20">
              <i className="fa-solid fa-gear"></i>
            </button>
            <button onClick={() => setShowCalc(false)} className="h-11 rounded-xl bg-sage text-white font-bold flex items-center justify-center active:scale-95">
              <i className="fa-solid fa-check"></i>
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showManageRates} onClose={() => setShowManageRates(false)} title="匯率管理設定">
        <div className="space-y-6 pb-4 px-1">
          <div className="space-y-3">
            <div className="flex justify-between px-2 items-end">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">當前匯率清單</span>
              <button onClick={syncAllRates} className="text-[10px] text-sage font-bold flex items-center gap-1 active:scale-90 transition-transform">
                <i className={`fa-solid fa-rotate ${isSyncing ? 'animate-spin' : ''}`}></i> 同步最新
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar">
              {Object.entries(currencyRates).map(([code, rate]) => (
                <div key={code} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-slate shadow-sm">
                  <span className="font-bold text-sage">{code} <span className="text-earth-dark/40 mx-2">x</span> {rate} TWD</span>
                  {code !== 'TWD' && <button onClick={() => handleDeleteRate(code)} className="w-8 h-8 flex items-center justify-center text-terracotta/40 hover:text-terracotta active:scale-90 transition-all"><i className="fa-solid fa-trash-can text-sm"></i></button>}
                </div>
              ))}
            </div>
          </div>
          <div className="bg-cream p-5 rounded-3xl border-2 border-slate space-y-4 shadow-inner">
            <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest text-center opacity-80">新增自定義幣別</p>
            <div className="flex gap-2">
              <input type="text" placeholder="代碼 (JPY)" value={newRateCode} onChange={(e) => setNewRateCode(e.target.value.toUpperCase())} className="w-1/2 p-4 bg-white border-2 border-slate rounded-xl text-xs font-bold text-sage outline-none shadow-sm" />
              <input type="number" placeholder="對台幣匯率" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} className="w-1/2 p-4 bg-white border-2 border-slate rounded-xl text-xs font-bold text-sage outline-none shadow-sm" />
            </div>
            <NordicButton onClick={handleAddNewRate} className="w-full py-3.5 bg-terracotta text-white border-none text-xs font-bold">確認新增匯率</NordicButton>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showChart} onClose={() => setShowChart(false)} title={selectedCategoryForAnalysis ? `${getCategoryLabel(selectedCategoryForAnalysis)}細項` : "支出類別分析"}>
        <div className="space-y-6 pb-6 px-1 flex flex-col items-center bg-transparent">
          {chartData.length > 0 ? (
            selectedCategoryForAnalysis ? (
              <div className="animate-in slide-in-from-right duration-300 w-full">
                <div className="flex items-center justify-between mb-4">
                  <button onClick={() => setSelectedCategoryForAnalysis(null)} className="text-xs font-bold text-sage flex items-center gap-1 active:scale-90 transition-transform">
                    <i className="fa-solid fa-chevron-left"></i> 返回總覽
                  </button>
                </div>
                <div className="space-y-3 max-h-[50vh] overflow-y-auto no-scrollbar pr-1">
                  {categoryDetails.map((exp) => (
                    <div key={exp.id} className="bg-white p-4 rounded-2xl border border-slate flex justify-between items-center shadow-sm">
                      <div className="flex items-center gap-3">
                        <img src={members.find(m => m.id === exp.payerId)?.avatar} className="w-8 h-8 rounded-full border border-slate" alt="payer" />
                        <div>
                          <div className="text-sm font-bold text-sage">{exp.note || '項目'}</div>
                          <div className="text-[9px] font-bold text-earth-dark opacity-60 uppercase">{exp.date}</div>
                        </div>
                      </div>
                      <div className="text-right font-bold text-sage text-xs">{exp.currency} {exp.amount.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full bg-transparent">
                <div className="relative flex justify-center py-4 bg-transparent mb-4">
                  <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-56 h-56 -rotate-90 bg-transparent overflow-visible drop-shadow-xl">
                    {chartData.map((slice, i) => {
                      const [startX, startY] = getCoordinatesForPercent(slice.startPercent);
                      const [endX, endY] = getCoordinatesForPercent(slice.endPercent);
                      const midPercent = (slice.startPercent + slice.endPercent) / 2;
                      const [textX, textY] = getCoordinatesForPercent(midPercent, 0.72);
                      const largeArcFlag = slice.fraction > 0.5 ? 1 : 0;
                      const pathColor = sliceColorMap[slice.color] || '#E0E5D5';

                      return (
                        <g key={i} className="cursor-pointer group">
                          <path 
                            d={`M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`} 
                            fill={pathColor} 
                            className="hover:opacity-85 transition-opacity" 
                            onClick={() => setSelectedCategoryForAnalysis(slice.category)} 
                          />
                          {slice.fraction > 0.04 && (
                            <text
                              x={textX}
                              y={textY}
                              transform={`rotate(90, ${textX}, ${textY})`}
                              fill="white"
                              fontSize="0.14"
                              fontWeight="bold"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="pointer-events-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
                            >
                              {Math.round(slice.fraction * 100)}%
                            </text>
                          )}
                        </g>
                      );
                    })}
                    <circle cx="0" cy="0" r="0.45" fill="#F7F4EB" />
                  </svg>
                </div>
                <div className="space-y-3 w-full">
                   <div className="px-2 pb-4 text-center">
                     <span className="text-[11px] font-bold text-earth-dark uppercase tracking-[0.2em] opacity-80">
                        總支出 NT$ {Math.round(totalTeamTWD).toLocaleString()}
                     </span>
                   </div>
                  {chartData.map((slice, i) => (
                    <div key={i} onClick={() => setSelectedCategoryForAnalysis(slice.category)} className="bg-white p-4 rounded-2xl border border-slate flex items-center justify-between shadow-sm cursor-pointer hover:bg-cream/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] ${slice.color}`}><i className={`fa-solid ${getCategoryIcon(slice.category)}`}></i></div>
                        <span className="text-sm font-bold text-sage">{getCategoryLabel(slice.category)}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-sage">NT$ {Math.round(slice.amount).toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-earth-dark opacity-60">{slice.percent}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : <div className="py-20 text-center text-earth-dark/40 italic">無記帳數據</div>}
          <NordicButton onClick={() => setShowChart(false)} className="w-full py-4 mt-6 bg-sage text-white font-bold">返回記帳本</NordicButton>
        </div>
      </Modal>

      <Modal isOpen={showDetail} onClose={() => setShowDetail(false)} title="支出分攤明細">
        {selectedExpense && (
          <div className="space-y-6 pb-4 px-1">
            <div className="text-center space-y-2">
              <div className={`inline-block px-4 py-1 ${CATEGORY_COLORS[selectedExpense.category] || 'bg-sage'} text-white rounded-full text-[10px] font-bold uppercase tracking-widest`}>{getCategoryLabel(selectedExpense.category)}</div>
              <h2 className="text-2xl font-bold text-sage">{selectedExpense.note || '未命名支出'}</h2>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold text-terracotta">{selectedExpense.currency} {selectedExpense.amount.toLocaleString()}</span>
                {selectedExpense.currency !== 'TWD' && (
                  <span className="text-[10px] font-bold text-earth-dark opacity-60 mt-1 uppercase">約 NT$ {Math.round(selectedExpense.amount * (currencyRates[selectedExpense.currency] || 1)).toLocaleString()}</span>
                )}
                <span className="text-[9px] font-bold text-earth-dark/40 uppercase tracking-[0.2em] mt-1">{selectedExpense.date}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border-2 border-slate space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate pb-4">
                <span className="text-[10px] font-bold text-earth-dark uppercase tracking-widest">代墊付款人</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-sage">{members.find(m => m.id === selectedExpense.payerId)?.name}</span>
                  <img src={members.find(m => m.id === selectedExpense.payerId)?.avatar} className="w-10 h-10 rounded-full border-2 border-slate shadow-sm" alt="payer" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-1">
                   <span className="text-[10px] font-bold text-earth-dark uppercase tracking-widest">債務與分攤細節</span>
                   <span className="text-[9px] font-bold text-sage opacity-60">點擊標記結清</span>
                </div>
                <div className="space-y-3">
                  {selectedExpense.splitWith.map(id => {
                    const isPayer = id === selectedExpense.payerId;
                    const isCleared = clearedSplits[`${selectedExpense.id}-${id}`];
                    const m = members.find(mem => mem.id === id);
                    const payer = members.find(mem => mem.id === selectedExpense.payerId);
                    const shareTwd = Math.round((selectedExpense.amount * (currencyRates[selectedExpense.currency] || 1)) / selectedExpense.splitWith.length);

                    return (
                      <div 
                        key={id} 
                        onClick={() => !isPayer && toggleClearedSplit(selectedExpense.id, id)}
                        className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${isPayer ? 'bg-slate/10 border-slate cursor-default' : isCleared ? 'bg-cream/30 border-slate opacity-60 grayscale' : 'bg-white border-sage/30 shadow-sm cursor-pointer active:scale-[0.98]'}`}
                      >
                        <div className="flex items-center gap-3">
                          <img src={m?.avatar} className="w-8 h-8 rounded-full border border-white shadow-sm" alt="split-member" />
                          <div className="flex flex-col">
                            <span className={`text-xs font-bold ${isCleared && !isPayer ? 'text-earth line-through' : 'text-sage'}`}>{m?.name}</span>
                            {!isPayer ? (
                              <span className="text-[9px] font-bold uppercase tracking-tighter mt-0.5 text-earth-dark">
                                應付 NT$ {shareTwd.toLocaleString()} <span className="mx-1">→</span> {payer?.name}
                              </span>
                            ) : (
                              <span className="text-[9px] text-earth-dark font-bold uppercase tracking-tighter mt-0.5">自付份額</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {!isPayer && (
                              <div className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${isCleared ? 'bg-sage text-white' : 'bg-terracotta/10 text-terracotta'}`}>
                                 {isCleared ? '已結清' : '未付'}
                              </div>
                           )}
                           {isPayer && <i className="fa-solid fa-crown text-terracotta/40 text-[10px] mr-1"></i>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <NordicButton onClick={() => setShowDetail(false)} className="w-full py-4 bg-sage text-white font-bold">確認關閉</NordicButton>
          </div>
        )}
      </Modal>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="修改支出內容">
        <div className="space-y-6 px-1 pb-4">
          <div className="bg-cream p-4 rounded-3xl border border-slate text-center">
            <span className="text-[10px] font-bold text-earth-dark uppercase mb-2 block tracking-widest">金額</span>
            <div className="flex items-center gap-3">
              <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="bg-white border-2 border-slate rounded-2xl p-3 h-14 outline-none font-bold text-sage">
                {Object.keys(currencyRates).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full p-4 h-14 bg-white border-2 border-slate rounded-2xl text-2xl font-bold text-sage outline-none shadow-inner" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2">
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="col-span-2 h-14 bg-white border-2 border-slate rounded-2xl text-xs outline-none font-bold text-sage text-center">
                <option value="Food">餐飲</option><option value="Transport">交通</option><option value="Shopping">採買</option><option value="Hotel">住宿</option><option value="Activity">活動</option>
              </select>
              <input type="text" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="備註" className="col-span-4 h-14 px-4 bg-white border-2 border-slate rounded-2xl text-sm outline-none font-bold text-sage" />
            </div>
            <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full h-14 px-4 bg-white border-2 border-slate rounded-2xl font-bold text-sage outline-none text-center" />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest pl-2">誰付錢？</p>
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {members.map(m => (
                <button key={m.id} onClick={() => setFormData({ ...formData, payerId: m.id })} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all ${formData.payerId === m.id ? 'border-sage bg-sage text-white shadow-md' : 'border-slate bg-white text-earth opacity-60'}`}>
                  <img src={m.avatar} className="w-7 h-7 rounded-full shadow-inner" alt="m-avatar" />
                  <span className="text-xs font-bold">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
             <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest pl-2">分攤成員</p>
             <div className="grid grid-cols-2 gap-2">
               {members.map(m => (
                 <button key={m.id} onClick={() => toggleSplitMember(m.id)} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${formData.splitWith.includes(m.id) ? 'border-sage bg-sage/5 text-sage shadow-sm' : 'border-slate bg-white text-earth opacity-40'}`}>
                   <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${formData.splitWith.includes(m.id) ? 'bg-sage border-sage' : 'border-slate'}`}>
                     {formData.splitWith.includes(m.id) && <i className="fa-solid fa-check text-white text-[9px]"></i>}
                   </div>
                   <img src={m.avatar} className="w-7 h-7 rounded-full shadow-inner" alt="split-avatar" />
                   <span className="text-xs font-bold">{m.name}</span>
                 </button>
               ))}
             </div>
          </div>

          <div className="flex gap-4 pt-4">
           <button onClick={() => handleDeleteExpense(formData.id)} className="flex-1 h-16 bg-terracotta text-white rounded-3xl shadow-lg active:scale-95 transition-all">
             <i className="fa-solid fa-trash"></i>
             </button>
            <button onClick={handleUpdateExpense} className="flex-1 h-16 bg-sage text-white rounded-3xl font-bold shadow-lg active:scale-95 transition-all">儲存修改</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="記帳一筆支出">
        <div className="space-y-6 px-1 pb-4">
          <div className="bg-cream p-4 rounded-3xl border border-slate text-center">
            <span className="text-[10px] font-bold text-earth-dark uppercase mb-2 block tracking-widest">輸入金額</span>
            <div className="flex items-center gap-3">
              <select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="bg-white border-2 border-slate rounded-2xl p-3 h-14 font-bold text-sage">
                {Object.keys(currencyRates).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" inputMode="decimal" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full p-4 h-14 bg-white border-2 border-slate rounded-2xl text-2xl font-bold text-sage text-center shadow-inner" placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-6 gap-2">
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="col-span-2 h-14 bg-white border-2 border-slate rounded-2xl text-xs font-bold text-sage text-center">
                <option value="Food">餐飲</option><option value="Transport">交通</option><option value="Shopping">採買</option><option value="Hotel">住宿</option><option value="Activity">活動</option>
              </select>
              <input type="text" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="備註用途" className="col-span-4 h-14 px-4 bg-white border-2 border-slate rounded-2xl text-sm font-bold text-sage shadow-inner" />
            </div>
            <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full h-14 px-4 bg-white border-2 border-slate rounded-2xl font-bold text-sage shadow-sm text-center" />
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest pl-2 opacity-80">誰付錢？</p>
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
              {members.map(m => (
                <button key={m.id} onClick={() => setFormData({ ...formData, payerId: m.id })} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-2xl border-2 transition-all ${formData.payerId === m.id ? 'border-sage bg-sage text-white shadow-md' : 'border-slate bg-white text-earth opacity-60 hover:opacity-100'}`}>
                  <img src={m.avatar} className="w-7 h-7 rounded-full shadow-inner" alt="member-avatar" />
                  <span className="text-xs font-bold">{m.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
             <div className="flex justify-between items-center px-2">
                <p className="text-[10px] font-bold text-earth-dark uppercase tracking-widest opacity-80">分攤成員</p>
                <button onClick={() => setFormData({...formData, splitWith: members.map(m => m.id)})} className="text-[10px] font-bold text-sage underline opacity-60 uppercase tracking-[0.1em]">快速全選</button>
             </div>
             <div className="grid grid-cols-2 gap-2">
               {members.map(m => (
                 <button key={m.id} onClick={() => toggleSplitMember(m.id)} className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${formData.splitWith.includes(m.id) ? 'border-sage bg-sage/5 text-sage shadow-sm' : 'border-slate bg-white text-earth opacity-40 hover:opacity-60'}`}>
                   <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${formData.splitWith.includes(m.id) ? 'bg-sage border-sage' : 'border-slate'}`}>
                     {formData.splitWith.includes(m.id) && <i className="fa-solid fa-check text-white text-[9px]"></i>}
                   </div>
                   <img src={m.avatar} className="w-7 h-7 rounded-full shadow-inner" alt="split-avatar" />
                   <span className="text-xs font-bold">{m.name}</span>
                 </button>
               ))}
             </div>
          </div>

          <NordicButton onClick={handleAddExpense} className="w-full h-15 bg-sage text-white font-bold text-sm shadow-lg active:scale-95 transition-all mt-2">確認並新增支出</NordicButton>
        </div>
      </Modal>
    </div>
  );
};

export default ExpenseView;
