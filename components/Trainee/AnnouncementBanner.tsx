import React, { useState, useEffect } from 'react';
import { Announcement } from '../../types';

interface AnnouncementBannerProps {
    announcements: Announcement[];
    employeeId: string;
}

export const AnnouncementBanner: React.FC<AnnouncementBannerProps> = ({ announcements, employeeId }) => {
    const [readAnnouncements, setReadAnnouncements] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(`sb_read_announcements_${employeeId}`);
        if (stored) {
            setReadAnnouncements(JSON.parse(stored));
        }
    }, [employeeId]);

    const markAsRead = (announcementId: string) => {
        const updated = [...readAnnouncements, announcementId];
        setReadAnnouncements(updated);
        localStorage.setItem(`sb_read_announcements_${employeeId}`, JSON.stringify(updated));
    };

    const activeAnnouncements = [...announcements]
        .filter(a => a.active)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const unreadAnnouncements = activeAnnouncements.filter(a => !readAnnouncements.includes(a.id));
    const readActiveAnnouncements = activeAnnouncements.filter(a => readAnnouncements.includes(a.id));

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high': return 'bg-rose-50 border-rose-200';
            case 'normal': return 'bg-blue-50 border-blue-200';
            case 'low': return 'bg-slate-50 border-slate-200';
            default: return 'bg-blue-50 border-blue-200';
        }
    };

    const getPriorityIcon = (priority: string) => {
        switch (priority) {
            case 'high': return '🔴';
            case 'normal': return '📢';
            case 'low': return 'ℹ️';
            default: return '📢';
        }
    };

    // お知らせが一件もない場合は何も表示しない
    if (activeAnnouncements.length === 0) return null;

    return (
        <div className="space-y-3 mb-6">
            {/* 未読のお知らせ */}
            {unreadAnnouncements.map(announcement => (
                <div
                    key={announcement.id}
                    className={`p-4 rounded-2xl border-2 ${getPriorityColor(announcement.priority)} shadow-sm`}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">{getPriorityIcon(announcement.priority)}</span>
                                <h3 className="text-sm font-black text-slate-800">{announcement.title}</h3>
                                <span className="text-xs text-slate-400">
                                    {new Date(announcement.createdAt).toLocaleDateString('ja-JP')}
                                </span>
                            </div>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{announcement.content}</p>
                        </div>
                        <button
                            onClick={() => markAsRead(announcement.id)}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all whitespace-nowrap"
                        >
                            ✓ 読んだ
                        </button>
                    </div>
                </div>
            ))}

            {/* 履歴ボタン（既読のお知らせが1件以上あるときに表示） */}
            {readActiveAnnouncements.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-indigo-600 transition-colors px-3 py-2 bg-slate-100 hover:bg-indigo-50 rounded-xl"
                    >
                        <span>📚</span>
                        <span>お知らせ履歴（{readActiveAnnouncements.length}件）</span>
                        <span className="text-[10px]">{showHistory ? '▲ 閉じる' : '▼ 開く'}</span>
                    </button>

                    {showHistory && (
                        <div className="mt-3 space-y-2 animate-fadeIn">
                            {readActiveAnnouncements.map(announcement => (
                                <div
                                    key={announcement.id}
                                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 opacity-70"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="text-base mt-0.5">{getPriorityIcon(announcement.priority)}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="text-xs font-black text-slate-700">{announcement.title}</h4>
                                                <span className="text-[10px] text-slate-400">
                                                    {new Date(announcement.createdAt).toLocaleDateString('ja-JP')}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">既読</span>
                                            </div>
                                            <p className="text-xs text-slate-500 whitespace-pre-wrap line-clamp-2">{announcement.content}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
