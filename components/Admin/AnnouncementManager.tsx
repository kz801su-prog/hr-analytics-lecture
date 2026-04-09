import React, { useState } from 'react';
import { Announcement } from '../../types';

interface AnnouncementManagerProps {
    announcements: Announcement[];
    userName: string;
    onSave: (announcement: Announcement) => void;
    onToggleActive: (id: string, active: boolean) => void;
}

export const AnnouncementManager: React.FC<AnnouncementManagerProps> = ({
    announcements,
    userName,
    onSave,
    onToggleActive
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [priority, setPriority] = useState<'high' | 'normal' | 'low'>('normal');

    const handleCreate = () => {
        if (!title.trim() || !content.trim()) {
            alert('タイトルと内容を入力してください');
            return;
        }

        const newAnnouncement: Announcement = {
            id: `ANN-${Date.now()}`,
            title: title.trim(),
            content: content.trim(),
            createdAt: new Date().toISOString(),
            createdBy: userName,
            priority,
            active: true
        };

        onSave(newAnnouncement);
        setTitle('');
        setContent('');
        setPriority('normal');
        setIsCreating(false);
    };

    const getPriorityBadge = (p: string) => {
        switch (p) {
            case 'high': return <span className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded">🔴 重要</span>;
            case 'normal': return <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">📢 通常</span>;
            case 'low': return <span className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded">ℹ️ 参考</span>;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-slate-800">📢 お知らせ管理</h2>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition-all shadow-lg"
                >
                    {isCreating ? '✕ キャンセル' : '+ 新規作成'}
                </button>
            </div>

            {isCreating && (
                <div className="bg-white p-6 rounded-2xl border-2 border-indigo-200 shadow-lg">
                    <h3 className="text-lg font-black text-slate-800 mb-4">新しいお知らせ</h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">タイトル</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none"
                                placeholder="お知らせのタイトル"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">内容</label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none resize-none"
                                rows={4}
                                placeholder="お知らせの内容"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">優先度</label>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setPriority('high')}
                                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all ${priority === 'high'
                                        ? 'bg-rose-100 border-2 border-rose-500 text-rose-700'
                                        : 'bg-slate-50 border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                >
                                    🔴 重要
                                </button>
                                <button
                                    onClick={() => setPriority('normal')}
                                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all ${priority === 'normal'
                                        ? 'bg-blue-100 border-2 border-blue-500 text-blue-700'
                                        : 'bg-slate-50 border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                >
                                    📢 通常
                                </button>
                                <button
                                    onClick={() => setPriority('low')}
                                    className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all ${priority === 'low'
                                        ? 'bg-slate-100 border-2 border-slate-500 text-slate-700'
                                        : 'bg-slate-50 border-2 border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                >
                                    ℹ️ 参考
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={handleCreate}
                            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl transition-all"
                        >
                            作成
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-600">既存のお知らせ ({announcements.length}件)</h3>
                {announcements.length === 0 ? (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold">お知らせはまだありません</p>
                    </div>
                ) : (
                    [...announcements].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(announcement => (
                        <div
                            key={announcement.id}
                            className={`p-4 rounded-2xl border-2 ${announcement.active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        {getPriorityBadge(announcement.priority)}
                                        <h4 className="text-sm font-black text-slate-800">{announcement.title}</h4>
                                        {!announcement.active && (
                                            <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded">非表示</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-600 mb-2 whitespace-pre-wrap">{announcement.content}</p>
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span>作成: {new Date(announcement.createdAt).toLocaleString('ja-JP')}</span>
                                        <span>作成者: {announcement.createdBy}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onToggleActive(announcement.id, !announcement.active)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${announcement.active
                                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                        }`}
                                >
                                    {announcement.active ? '非表示にする' : '表示する'}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
