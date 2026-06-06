import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Customer } from '../types';
import { COMMON_ROOMS } from '../data';
import { ALL_TEMPLATE_ITEMS, checklistSectionsForRoom, homeAge, recommendedItemsForRoom } from '../checklistTemplates';

interface BuildChecklistProps {
  customers: Customer[];
  selectedCustomerId: string | null;
  onUpdateCustomer: (c: Customer) => void;
}

function AddRoomModal({ existingRooms, onAdd, onClose }: {
  existingRooms: string[];
  onAdd: (room: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  const available = COMMON_ROOMS.filter(r => !existingRooms.includes(r));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Add Room</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Common Rooms</p>
              <div className="flex flex-wrap gap-2">
                {available.map(r => (
                  <button
                    key={r}
                    onClick={() => { onAdd(r); onClose(); }}
                    className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Custom Room</p>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Room name..."
                value={custom}
                onChange={e => setCustom(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { onAdd(custom.trim()); onClose(); }}}
              />
              <button
                onClick={() => { if (custom.trim()) { onAdd(custom.trim()); onClose(); }}}
                className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BuildChecklist({ customers, selectedCustomerId, onUpdateCustomer }: BuildChecklistProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const [copySourceCustomerId, setCopySourceCustomerId] = useState('');

  const customer = customers.find(c => c.id === selectedCustomerId) || customers[0];
  const rooms = customer?.rooms || [];
  const activeRoom = selectedRoom || rooms[0] || null;
  const checklist: Record<string, string[]> = customer?.checklist || {};
  const activeItems: string[] = activeRoom ? (checklist[activeRoom] || []) : [];

  const templateSections = activeRoom ? checklistSectionsForRoom(activeRoom, customer) : {};
  const recommendedItems = activeRoom ? recommendedItemsForRoom(activeRoom, customer) : [];
  const age = homeAge(customer);
  const visibleTemplateItems = new Set(Object.values(templateSections).flat());
  const additionalItems = activeItems.filter(item => !visibleTemplateItems.has(item));
  const itemSuggestions = customInput.trim().length >= 2
    ? ALL_TEMPLATE_ITEMS.filter(item =>
        !activeItems.includes(item) &&
        item.toLowerCase().includes(customInput.trim().toLowerCase())
      ).slice(0, 8)
    : [];

  const isChecked = (item: string) => activeRoom ? activeItems.includes(item) : false;

  const selectRecommended = () => {
    if (!customer || !activeRoom) return;
    const updated = Array.from(new Set([...(checklist[activeRoom] || []), ...recommendedItems]));
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: updated } });
  };

  const applyRecommendedToAllRooms = () => {
    if (!customer) return;
    const nextChecklist = { ...checklist };
    customer.rooms.forEach(room => {
      nextChecklist[room] = Array.from(new Set([...(nextChecklist[room] || []), ...recommendedItemsForRoom(room, customer)]));
    });
    onUpdateCustomer({ ...customer, checklist: nextChecklist });
  };

  const copyChecklistFromProperty = () => {
    if (!customer || !copySourceCustomerId) return;
    const source = customers.find(c => c.id === copySourceCustomerId);
    if (!source) return;
    if (!window.confirm(`Copy the full checklist from ${source.name} to ${customer.name}? This will replace this property's current rooms and checklist.`)) return;
    onUpdateCustomer({
      ...customer,
      rooms: [...source.rooms],
      checklist: JSON.parse(JSON.stringify(source.checklist || {})) as Record<string, string[]>,
    });
  };

  const copyActiveRoomFromProperty = () => {
    if (!customer || !activeRoom || !copySourceCustomerId) return;
    const source = customers.find(c => c.id === copySourceCustomerId);
    if (!source) return;
    const sourceItems = source.checklist[activeRoom] || [];
    if (sourceItems.length === 0) {
      alert(`${source.name} does not have checklist items for ${activeRoom}.`);
      return;
    }
    if (!window.confirm(`Copy ${activeRoom} checklist from ${source.name} to ${customer.name}? This will replace the current ${activeRoom} checklist.`)) return;
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: [...sourceItems] } });
  };

  const clearRoomChecklist = () => {
    if (!customer || !activeRoom) return;
    if (!window.confirm(`Clear all checklist items for ${activeRoom}?`)) return;
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: [] } });
  };

  const toggleSection = (items: string[]) => {
    if (!customer || !activeRoom) return;
    const current = checklist[activeRoom] || [];
    const allSelected = items.every(item => current.includes(item));
    const updated = allSelected
      ? current.filter(item => !items.includes(item))
      : Array.from(new Set([...current, ...items]));
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: updated } });
  };

  const toggleItem = (item: string) => {
    if (!customer || !activeRoom) return;
    const current = checklist[activeRoom] || [];
    const updated = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: updated } });
  };

  const addChecklistItem = (rawItem: string) => {
    if (!customer || !activeRoom) return;
    const item = rawItem.trim();
    if (!item) return;
    const current = checklist[activeRoom] || [];
    if (current.some(existing => existing.toLowerCase() === item.toLowerCase())) {
      setCustomInput('');
      return;
    }
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: [...current, item] } });
    setCustomInput('');
  };

  const addCustomItem = () => addChecklistItem(customInput);

  const deleteCustomItem = (item: string) => {
    if (!customer || !activeRoom) return;
    const updated = (checklist[activeRoom] || []).filter(i => i !== item);
    onUpdateCustomer({ ...customer, checklist: { ...checklist, [activeRoom]: updated } });
  };

  const addRoom = (room: string) => {
    if (!customer) return;
    onUpdateCustomer({ ...customer, rooms: [...customer.rooms, room] });
    setSelectedRoom(room);
  };

  const deleteRoom = (room: string) => {
    if (!customer) return;
    const newRooms = customer.rooms.filter(r => r !== room);
    const newChecklist = { ...customer.checklist };
    delete newChecklist[room];
    onUpdateCustomer({ ...customer, rooms: newRooms, checklist: newChecklist });
    if (activeRoom === room) setSelectedRoom(newRooms[0] || null);
  };

  if (!customer) return <div className="p-6 text-slate-400">No customer selected.</div>;

  return (
    <div className="flex h-full">
      {/* Left: Room List */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 text-sm">Rooms</h2>
            <p className="text-xs text-slate-400 mt-0.5">{customer.name}</p>
          </div>
          <button onClick={() => setShowAddRoom(true)} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {rooms.map(room => {
            const count = (checklist[room] || []).length;
            const isActive = room === activeRoom;
            return (
              <div
                key={room}
                className={`flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors ${isActive ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedRoom(room)}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>{room}</p>
                  <p className="text-xs text-slate-400">{count} items</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); deleteRoom(room); }}
                  className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Checklist builder */}
      {activeRoom ? (
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="max-w-2xl space-y-4">
            <div>
              <h2 className="font-semibold text-slate-800 text-lg">{activeRoom}</h2>
              <p className="text-slate-500 text-sm">{activeItems.length} selected · {recommendedItems.length} recommended for this room{age ? ` · Built ${customer.home.yearBuilt} (${age} years old)` : ''}</p>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-blue-800">Lean recommended checklist</p>
                <p className="text-xs text-blue-700 mt-0.5">Defaults are intentionally limited. Use search below to pull in more items from the full checklist library when needed.</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={selectRecommended} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors">Select This Room</button>
                <button onClick={applyRecommendedToAllRooms} className="bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-blue-50 transition-colors">Auto-Fill All Rooms</button>
                <button onClick={clearRoomChecklist} className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-slate-50 transition-colors">Clear Room</button>
              </div>
            </div>

            {customers.filter(c => c.id !== customer.id).length > 0 && (
              <div className="bg-white rounded-2xl border border-indigo-100 p-4">
                <p className="text-xs font-semibold text-indigo-700 mb-1">Duplicate Checklist From Another Property</p>
                <p className="text-xs text-slate-400 mb-3">Useful for condos, apartments, or similar units. You can copy the entire property checklist or just the current room.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    value={copySourceCustomerId}
                    onChange={e => setCopySourceCustomerId(e.target.value)}
                  >
                    <option value="">Choose source property...</option>
                    {customers.filter(c => c.id !== customer.id).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
                  </select>
                  <button disabled={!copySourceCustomerId} onClick={copyActiveRoomFromProperty} className="border border-indigo-200 text-indigo-700 px-3 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-40">Copy This Room</button>
                  <button disabled={!copySourceCustomerId} onClick={copyChecklistFromProperty} className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-40">Copy Full Checklist</button>
                </div>
              </div>
            )}

            {/* Checklist item input */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-semibold text-slate-500 mb-1">Add Checklist Item</p>
              <p className="text-xs text-slate-400 mb-3">Start typing to search the full checklist library, or type a brand-new item and click Add.</p>
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="Search or create checklist item..."
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCustomItem(); }}
                  />
                  <button onClick={addCustomItem} className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                    Add
                  </button>
                </div>
                {itemSuggestions.length > 0 && (
                  <div className="absolute left-0 right-16 top-11 z-20 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                    {itemSuggestions.map(item => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          addChecklistItem(item);
                        }}
                        onClick={() => addChecklistItem(item)}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 border-b border-slate-50 last:border-b-0"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Items */}
            {additionalItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Additional Items</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {additionalItems.map(item => (
                    <div key={item} className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked(item)}
                        onChange={() => toggleItem(item)}
                        className="w-4 h-4 accent-blue-600 flex-shrink-0"
                      />
                      <span className="flex-1 text-sm text-slate-700">{item}</span>
                      <button onClick={() => deleteCustomItem(item)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Master Checklist Categories */}
            {Object.entries(templateSections).map(([category, items]) => {
              const selectedCount = items.filter(isChecked).length;
              const allSelected = selectedCount === items.length;
              return (
                <div key={category} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{category}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedCount}/{items.length} selected</p>
                    </div>
                    <button onClick={() => toggleSection(items)} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                      {allSelected ? 'Deselect section' : 'Select section'}
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {items.map(item => (
                      <label key={item} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked(item)}
                          onChange={() => toggleItem(item)}
                          className="w-4 h-4 accent-blue-600 flex-shrink-0"
                        />
                        <span className="text-sm text-slate-700">{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Select a room to build its checklist
        </div>
      )}

      {showAddRoom && (
        <AddRoomModal existingRooms={rooms} onAdd={addRoom} onClose={() => setShowAddRoom(false)} />
      )}
    </div>
  );
}
