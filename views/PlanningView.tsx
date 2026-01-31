import React, { useState, useEffect, useRef } from 'react';
import { NordicButton, NordicCard, Modal } from '../components/Shared';
import { TodoItem, ChecklistItem, Member, PackingCategory } from '../types';
import { dbService } from '../firebaseService';

type ListCategory = 'packing' | 'shopping' | 'info';

interface TravelInfo {
  id: string;
  text: string;
  authorId: string;
  imageUrl?: string;
  createdAt: number;
}

const PACKING_CATS: { id: PackingCategory; label: string; icon: string }[] = [
  { id: 'Essential', label: '必帶物品', icon: 'fa-passport' },
  { id: 'Gadgets', label: '3C用品', icon: 'fa-laptop' },
  { id: 'Clothing', label: '服飾衣著', icon: 'fa-shirt' },
  { id: 'Beauty', label: '美妝保養', icon: 'fa-bottle-droplet' },
  { id: 'Daily', label: '生活小物', icon: 'fa-soap' },
  { id: 'Others', label: '其他', icon: 'fa-ellipsis' }
];

interface PlanningViewProps {
  members: Member[];
}

const PlanningView: React.FC<PlanningViewProps> = ({ members }) => {
  const [activeTab, setActiveTab] = useState<'todo' | ListCategory>('todo');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const [expandedCats, setExpandedCats] = useState<Set<PackingCategory>>(
    new Set(PACKING_CATS.map(c => c.id))
  );

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [listData, setListData] = useState<
    Record<string, Record<'packing' | 'shopping', ChecklistItem[]>>
  >({});
  const [travelInfos, setTravelInfos] = useState<TravelInfo[]>([]);

  const [showAddTodo, setShowAddTodo] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);

  const [todoInput, setTodoInput] = useState({ text: '', assignedTo: 'ALL' });
  const [newItem, setNewItem] = useState<{ text: string; category: PackingCategory }>({
    text: '',
    category: 'Essential'
  });

  const [infoText, setInfoText] = useState('');
  const [infoImage, setInfoImage] = useState<string | null>(null);
  const [currentAuthorId, setCurrentAuthorId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- 雲端訂閱 ---------- */
  useEffect(() => {
    const unsubTodo = dbService.subscribeField('todos', d => setTodos(d || []));
    const unsubList = dbService.subscribeField('listData', d => setListData(d || {}));
    const unsubInfo = dbService.subscribeField('travelInfos', d => setTravelInfos(d || []));

    return () => {
      unsubTodo();
      unsubList();
      unsubInfo();
    };
  }, []);

  /* ---------- Todo ---------- */
  const handleAddTodo = () => {
    if (!todoInput.text.trim()) return;
    const next = [
      {
        id: Date.now().toString(),
        text: todoInput.text.trim(),
        completed: false,
        assignedTo: todoInput.assignedTo
      },
      ...todos
    ];
    dbService.updateField('todos', next);
    setShowAddTodo(false);
    setTodoInput({ text: '', assignedTo: 'ALL' });
  };

  const deleteTodo = (id: string) => {
    dbService.updateField(
      'todos',
      todos.filter(t => t.id !== id)
    );
  };

  /* ---------- Checklist ---------- */
  const handleAddItem = () => {
    if (!selectedMemberId || !newItem.text.trim()) return;

    const tab = activeTab === 'shopping' ? 'shopping' : 'packing';

    const item: ChecklistItem = {
      id: Date.now().toString(),
      text: newItem.text.trim(),
      completed: false,
      ownerId: selectedMemberId,
      category: tab === 'packing' ? newItem.category : 'Others'
    };

    const memberData = listData[selectedMemberId] || { packing: [], shopping: [] };

    const next = {
      ...listData,
      [selectedMemberId]: {
        ...memberData,
        [tab]: [...memberData[tab], item]
      }
    };

    dbService.updateField('listData', next);
    setShowAddItemModal(false);
    setNewItem(prev => ({ ...prev, text: '' }));
  };

  /* ---------- Render ---------- */
  return (
    <div
      className="px-4 overflow-x-hidden animate-in fade-in duration-500 -mt-4"
      style={{ paddingBottom: '6.5rem' }}
    >
      {/* 標題 */}
      <div className="pb-4">
        <h1 className="text-3xl font-bold text-sage tracking-tight">事前準備</h1>
        <p className="text-earth-dark mt-1 font-bold italic">同步所有人的準備進度</p>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex bg-white/60 p-1.5 rounded-full border border-paper/40 shadow-inner">
        {(['todo', 'packing', 'shopping', 'info'] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setActiveTab(t);
              setSelectedMemberId(null);
            }}
            className={`flex-1 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              activeTab === t
                ? 'bg-sage text-white shadow-lg'
                : 'text-earth-dark/60 hover:bg-white/30'
            }`}
          >
            {t === 'todo'
              ? '團隊待辦'
              : t === 'packing'
              ? '行李'
              : t === 'shopping'
              ? '採買'
              : '資訊'}
          </button>
        ))}
      </div>

      {/* Todo */}
      {activeTab === 'todo' && (
        <div className="space-y-4 mt-6">
          <NordicButton
            onClick={() => setShowAddTodo(true)}
            className="w-full h-14 bg-stamp border-none text-xs uppercase tracking-[0.2em] font-bold shadow-xl"
          >
            新增團隊待辦
          </NordicButton>

          {todos.map(item => (
            <div key={item.id} className="bg-white p-4 rounded-2xl shadow">
              <div className="flex justify-between">
                <span>{item.text}</span>
                <button onClick={() => deleteTodo(item.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={showAddTodo} onClose={() => setShowAddTodo(false)} title="新增團隊待辦">
        <input
          value={todoInput.text}
          onChange={e => setTodoInput({ ...todoInput, text: e.target.value })}
          className="w-full p-3 border rounded-xl"
        />
        <NordicButton onClick={handleAddTodo} className="w-full mt-4">
          確定新增
        </NordicButton>
      </Modal>

      <Modal
        isOpen={showAddItemModal}
        onClose={() => setShowAddItemModal(false)}
        title="新增項目"
      >
        <input
          value={newItem.text}
          onChange={e => setNewItem({ ...newItem, text: e.target.value })}
          className="w-full p-3 border rounded-xl"
        />
        <NordicButton onClick={handleAddItem} className="w-full mt-4">
          加入清單
        </NordicButton>
      </Modal>
    </div>
  );
};

export default PlanningView;
