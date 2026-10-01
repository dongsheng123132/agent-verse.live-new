import React, { useEffect, useMemo, useState } from 'react';
import { Paintbrush, KeyRound, Eye, EyeOff, ClipboardPaste } from 'lucide-react';
import { Cell } from '../app/types';
import {
    DecorateValues,
    appliedMismatches,
    describeUpdateFailure,
    diffValues,
    validateChanges,
    valuesFromCell,
} from '../lib/cell-decorate';
import { getCellKey, isPlausibleCellKey, removeCellKey, safeLocalStorage, saveCellKey } from '../lib/wallet-pay/key-store';

interface DecorateFormProps {
    cell: Cell;
    /** Open the form straight away (right after a purchase). */
    autoOpen?: boolean;
    /** Re-read the cell + map after a save; resolves with the fresh cell (or null if the re-read failed). */
    onUpdated: (x: number, y: number) => Promise<Cell | null>;
}

type Msg = { kind: 'ok' | 'warn' | 'error'; text: string } | null;

const FIELD = 'w-full bg-[#050505] border border-[#333] rounded px-2 py-1.5 text-xs font-mono text-gray-200 focus:border-green-500 focus:outline-none placeholder:text-gray-600';
const LABEL = 'block text-[10px] text-gray-500 font-mono mb-0.5';

/**
 * "装修" — edit the cell the person owns. Shown when this browser remembers the
 * cell's API key (set automatically after a wallet purchase) or after clicking
 * 「我有 key」 and pasting one. Saves with PUT /api/cells/update (Bearer key).
 */
export const DecorateForm: React.FC<DecorateFormProps> = ({ cell, autoOpen, onUpdated }) => {
    const [storedKey, setStoredKey] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [showKey, setShowKey] = useState(false);
    // Only the fields the person touched are kept here; everything else follows the cell as it is
    // re-read from the server (the first copy of a cell, from the map list, lacks some fields — if we
    // snapshotted it, "untouched" fields would look changed and a save would wipe them).
    const [edits, setEdits] = useState<Partial<DecorateValues>>({});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<Msg>(null);

    // A different cell is shown: start clean.
    useEffect(() => {
        const k = getCellKey(safeLocalStorage(), cell.x, cell.y);
        setStoredKey(k);
        setKeyInput(k ?? '');
        setEdits({});
        setOpen(!!autoOpen && !!k);
        setMsg(null);
        setShowKey(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cell.x, cell.y]);

    // Asked to open by itself (right after a purchase; the key was saved just before).
    useEffect(() => {
        if (!autoOpen) return;
        const k = getCellKey(safeLocalStorage(), cell.x, cell.y);
        if (k) {
            setStoredKey(k);
            setKeyInput(k);
            setOpen(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpen]);

    const initial = useMemo(() => valuesFromCell(cell), [cell]);
    const values: DecorateValues = useMemo(() => ({ ...initial, ...edits }), [initial, edits]);
    const changed = diffValues(initial, values);
    const set = <K extends keyof DecorateValues>(k: K, v: DecorateValues[K]) => {
        setEdits(prev => ({ ...prev, [k]: v }));
        setMsg(null);
    };

    const pasteKey = async () => {
        try {
            const text = (await navigator.clipboard.readText()).trim();
            if (text) setKeyInput(text);
        } catch {
            setMsg({ kind: 'warn', text: '浏览器不让读取剪贴板，请长按输入框手动粘贴（Ctrl+V）' });
        }
    };

    const save = async () => {
        if (saving) return;
        const key = keyInput.trim();
        if (!isPlausibleCellKey(key)) {
            setMsg({ kind: 'error', text: '请先填写这个格子的 API key（gk_ 开头，买格子时只显示过一次）' });
            return;
        }
        const problem = validateChanges(changed);
        if (problem) {
            setMsg({ kind: 'error', text: problem });
            return;
        }
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/cells/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                body: JSON.stringify(changed),
            });
            let body: any = null;
            try { body = await res.json(); } catch { /* non-JSON error page */ }
            if (!res.ok || body?.ok === false) {
                setMsg({ kind: 'error', text: describeUpdateFailure(res.status, body) });
                return;
            }
            const fresh = await onUpdated(cell.x, cell.y);
            if (!fresh) {
                setMsg({ kind: 'warn', text: '已保存，但重新读取格子失败，请手动刷新页面查看' });
                return;
            }
            const bad = appliedMismatches(changed, fresh);
            if (bad.length > 0) {
                setMsg({ kind: 'warn', text: `服务器说保存成功，但这个格子上没有看到变化（${bad.join('、')}）——这把 key 可能属于别的格子，已修改的是那一格。请核对 key。` });
                return;
            }
            const probe = body?.service?.status ? `；服务探测结果：${body.service.status}` : '';
            if (key !== storedKey) {
                if (saveCellKey(safeLocalStorage(), cell.x, cell.y, key)) setStoredKey(key);
            }
            setEdits({});
            setMsg({ kind: 'ok', text: `已保存，地图和详情已刷新${probe}` });
        } catch (e: any) {
            setMsg({ kind: 'error', text: `网络请求失败：${e?.message || '请检查网络后重试'}` });
        } finally {
            setSaving(false);
        }
    };

    const forgetKey = () => {
        removeCellKey(safeLocalStorage(), cell.x, cell.y);
        setStoredKey(null);
        setKeyInput('');
        setMsg({ kind: 'ok', text: '已从这个浏览器移除这把 key' });
    };

    // Collapsed: one line. Remembered key -> "装修"; otherwise -> "我有 key".
    if (!open) {
        return (
            <div className="mb-4">
                <button
                    type="button"
                    data-testid={storedKey ? 'decorate-open' : 'have-key-open'}
                    onClick={() => setOpen(true)}
                    className={`w-full py-2 rounded border text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all ${storedKey
                        ? 'border-green-600 bg-green-900/20 text-green-300 hover:bg-green-900/40'
                        : 'border-[#333] bg-[#0a0a0a] text-gray-400 hover:border-gray-500 hover:text-white'}`}
                >
                    {storedKey ? <><Paintbrush size={13} /> 装修这个格子</> : <><KeyRound size={13} /> 我有 key（装修这个格子）</>}
                </button>
            </div>
        );
    }

    return (
        <div data-testid="decorate-form" className="mb-4 rounded-lg border border-green-700/50 bg-green-950/10 p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="text-green-400 text-xs font-mono font-bold flex items-center gap-1.5"><Paintbrush size={13} /> 装修 ({cell.x},{cell.y})</span>
                <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-gray-500 hover:text-white font-mono">收起</button>
            </div>

            {/* key */}
            <label className={LABEL} htmlFor="decorate-key">
                API key{storedKey ? '（已用本机保存的）' : '（买格子时只显示过一次，粘贴到这里）'}
            </label>
            <div className="flex gap-1.5 mb-3">
                <input
                    id="decorate-key"
                    data-testid="decorate-key"
                    type={showKey ? 'text' : 'password'}
                    value={keyInput}
                    onChange={e => { setKeyInput(e.target.value); setMsg(null); }}
                    placeholder="gk_…"
                    autoComplete="off"
                    spellCheck={false}
                    className={FIELD}
                />
                <button type="button" title="显示/隐藏" onClick={() => setShowKey(v => !v)} className="shrink-0 px-2 rounded border border-[#333] text-gray-400 hover:text-white">
                    {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button type="button" title="从剪贴板粘贴" onClick={pasteKey} className="shrink-0 px-2 rounded border border-[#333] text-gray-400 hover:text-white">
                    <ClipboardPaste size={13} />
                </button>
            </div>

            {/* look */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div>
                    <label className={LABEL} htmlFor="decorate-title">标题 title</label>
                    <input id="decorate-title" data-testid="decorate-title" className={FIELD} value={values.title} maxLength={120} onChange={e => set('title', e.target.value)} placeholder="我的格子" />
                </div>
                <div>
                    <label className={LABEL} htmlFor="decorate-color">格子颜色 fill_color</label>
                    <div className="flex gap-1.5">
                        <input
                            type="color"
                            aria-label="选择颜色"
                            value={/^#[0-9a-fA-F]{6}$/.test(values.fill_color) ? values.fill_color : '#10b981'}
                            onChange={e => set('fill_color', e.target.value)}
                            className="h-[30px] w-9 shrink-0 bg-transparent border border-[#333] rounded cursor-pointer"
                        />
                        <input id="decorate-color" data-testid="decorate-color" className={FIELD} value={values.fill_color} onChange={e => set('fill_color', e.target.value)} placeholder="#7c3aed" />
                    </div>
                </div>
            </div>
            <div className="mb-2">
                <label className={LABEL} htmlFor="decorate-summary">简介 summary</label>
                <textarea id="decorate-summary" data-testid="decorate-summary" className={`${FIELD} resize-y`} rows={2} value={values.summary} onChange={e => set('summary', e.target.value)} placeholder="一句话介绍" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div>
                    <label className={LABEL} htmlFor="decorate-image">图片地址 image_url</label>
                    <input id="decorate-image" data-testid="decorate-image" className={FIELD} value={values.image_url} onChange={e => set('image_url', e.target.value)} placeholder="https://…/logo.png" />
                </div>
                <div>
                    <label className={LABEL} htmlFor="decorate-iframe">嵌入网页 iframe_url（仅 https）</label>
                    <input id="decorate-iframe" data-testid="decorate-iframe" className={FIELD} value={values.iframe_url} onChange={e => set('iframe_url', e.target.value)} placeholder="https://your-site.com" />
                </div>
            </div>

            {/* service */}
            <div className="rounded border border-[#222] bg-[#0a0a0a] p-2 mb-3">
                <div className="text-[10px] text-gray-400 font-mono font-bold mb-1.5">挂服务（可选，让 AI 能在 /market 找到并调用你的 x402 接口）</div>
                <div className="grid grid-cols-[1fr_5rem] gap-2 mb-2">
                    <div>
                        <label className={LABEL} htmlFor="decorate-service-url">服务地址 service_url（https）</label>
                        <input id="decorate-service-url" data-testid="decorate-service-url" className={FIELD} value={values.service_url} onChange={e => set('service_url', e.target.value)} placeholder="https://api.example.com/paid" />
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="decorate-service-method">方法</label>
                        <select id="decorate-service-method" className={FIELD} value={values.service_method} onChange={e => set('service_method', e.target.value === 'POST' ? 'POST' : 'GET')}>
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                        <label className={LABEL} htmlFor="decorate-service-desc">服务说明 service_desc</label>
                        <input id="decorate-service-desc" className={FIELD} value={values.service_desc} onChange={e => set('service_desc', e.target.value)} placeholder="它能做什么" />
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="decorate-service-category">分类 service_category</label>
                        <input id="decorate-service-category" className={FIELD} value={values.service_category} onChange={e => set('service_category', e.target.value)} placeholder="data / ai / tools …" />
                    </div>
                </div>
            </div>

            {msg && (
                <div data-testid="decorate-msg" role={msg.kind === 'error' ? 'alert' : 'status'} className={`mb-2 rounded border p-2 text-xs font-mono break-words ${msg.kind === 'ok'
                    ? 'border-green-700/60 bg-green-900/20 text-green-300'
                    : msg.kind === 'warn' ? 'border-yellow-700/60 bg-yellow-900/20 text-yellow-300' : 'border-red-900/60 bg-red-900/20 text-red-300'}`}>
                    {msg.text}
                </div>
            )}

            <div className="flex gap-2">
                <button
                    type="button"
                    data-testid="decorate-save"
                    disabled={saving}
                    onClick={save}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-[#222] disabled:text-gray-500 text-white font-mono font-bold text-xs rounded"
                >
                    {saving ? '保存中…' : Object.keys(changed).length ? `保存（${Object.keys(changed).length} 项改动）` : '保存'}
                </button>
                {storedKey && (
                    <button type="button" onClick={forgetKey} className="shrink-0 px-3 py-2 text-[10px] font-mono rounded border border-[#333] text-gray-500 hover:text-red-300 hover:border-red-800">
                        忘掉本机的 key
                    </button>
                )}
            </div>
        </div>
    );
};
