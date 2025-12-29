'use client';

/**
 * Community Library Page - Modern & Clean Design
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  Search,
  Bot,
  BarChart3,
  Layers,
  TrendingUp,
  Star,
  Heart,
  GitBranch,
  Eye,
  Clock,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Loader2,
  Filter,
  Grid3X3,
  List,
  ArrowUpRight,
  Copy,
  Bookmark,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface LibraryItem {
  id: string;
  authorWallet: string;
  type: 'BOT' | 'STRATEGY' | 'TEMPLATE' | 'BACKTEST';
  name: string;
  description: string;
  tags: string[];
  symbol: string | null;
  performance: {
    totalReturn?: number;
    winRate?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
    trades?: number;
  } | null;
  isVerified: boolean;
  views: number;
  likes: number;
  remixes: number;
  avgRating: number;
  totalRatings: number;
  createdAt: string;
  author: {
    walletAddress: string;
    nickname: string | null;
  } | null;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  BOT: { icon: Bot, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Bot' },
  STRATEGY: { icon: Layers, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Strategy' },
  TEMPLATE: { icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Template' },
  BACKTEST: { icon: BarChart3, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20', label: 'Backtest' },
};

const SORT_OPTIONS = [
  { value: 'trending', label: 'Trending' },
  { value: 'recent', label: 'Recent' },
  { value: 'top_rated', label: 'Top Rated' },
  { value: 'most_remixed', label: 'Most Remixed' },
];

export default function LibraryPage() {
  const router = useRouter();
  const { wallet } = useWallet();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [remixing, setRemixing] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('');
  const [sort, setSort] = useState('trending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    fetchItems();
  }, [type, sort, page]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (type) params.append('type', type);
      if (sort) params.append('sort', sort);
      if (search) params.append('search', search);
      params.append('page', page.toString());
      params.append('limit', '12');
      
      const res = await fetch(`${API_URL}/api/library?${params}`);
      const data = await res.json();
      
      if (data.success) {
        setItems(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalItems(data.pagination?.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch library:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchItems();
  };

  const handleRemix = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!wallet.isConnected) return;
    
    setRemixing(itemId);
    try {
      const res = await fetch(`${API_URL}/api/library/${itemId}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      if (data.success) router.push(`/bots/${data.bot.id}`);
    } catch (error) {
      console.error('Failed to remix:', error);
    } finally {
      setRemixing(null);
    }
  };

  const formatWallet = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
  const formatNumber = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : n.toString();

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Minimal Header */}
      <header className="border-b border-white/[0.06] bg-[#09090b]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => router.push('/')} 
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-[15px] font-medium text-white/90">Library</h1>
              <span className="text-xs text-white/30 hidden sm:block">
                {totalItems} items
              </span>
            </div>
            
            {wallet.isConnected && (
              <button
                onClick={() => router.push('/bots')}
                className="text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                My Bots →
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Search & Filters Bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search strategies..."
                className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
          </form>
          
          <div className="flex gap-2">
            {/* Type Pills */}
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03]">
              <button
                onClick={() => { setType(''); setPage(1); }}
                className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
                  type === '' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                All
              </button>
              {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => { setType(key); setPage(1); }}
                  className={`px-3 h-7 rounded-md text-xs font-medium transition-colors ${
                    type === key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
              className="h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white/70 focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* View Toggle */}
            <div className="hidden sm:flex gap-1 p-1 rounded-lg bg-white/[0.03]">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/30 hover:text-white/50'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-white/20" />
            </div>
            <p className="text-sm text-white/40">No strategies found</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => {
              const config = TYPE_CONFIG[item.type];
              const TypeIcon = config?.icon || Bot;
              
              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/library/${item.id}`)}
                  className="group p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${config?.bg} border flex items-center justify-center`}>
                        <TypeIcon className={`w-4 h-4 ${config?.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">
                            {item.name}
                          </h3>
                          {item.isVerified && (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-white/30">
                          {item.author?.nickname || formatWallet(item.authorWallet)}
                        </p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-white/0 group-hover:text-white/40 transition-all" />
                  </div>
                  
                  {/* Description */}
                  <p className="text-xs text-white/40 line-clamp-2 mb-3 leading-relaxed">
                    {item.description}
                  </p>
                  
                  {/* Performance */}
                  {item.performance && (
                    <div className="flex gap-4 mb-3 py-2 px-3 rounded-lg bg-black/20">
                      {item.performance.totalReturn !== undefined && (
                        <div>
                          <div className={`text-sm font-semibold ${item.performance.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {item.performance.totalReturn >= 0 ? '+' : ''}{item.performance.totalReturn.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-white/30 uppercase tracking-wide">Return</div>
                        </div>
                      )}
                      {item.performance.winRate !== undefined && (
                        <div>
                          <div className="text-sm font-semibold text-white/80">{item.performance.winRate.toFixed(0)}%</div>
                          <div className="text-[10px] text-white/30 uppercase tracking-wide">Win</div>
                        </div>
                      )}
                      {item.performance.trades !== undefined && (
                        <div>
                          <div className="text-sm font-semibold text-white/80">{item.performance.trades}</div>
                          <div className="text-[10px] text-white/30 uppercase tracking-wide">Trades</div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <div className="flex items-center gap-3 text-[11px] text-white/30">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {formatNumber(item.likes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitBranch className="w-3 h-3" /> {formatNumber(item.remixes)}
                      </span>
                      <span className="flex items-center gap-1 text-amber-400/70">
                        <Star className="w-3 h-3" /> {item.avgRating.toFixed(1)}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleRemix(item.id, e)}
                      disabled={remixing === item.id || !wallet.isConnected}
                      className="px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[11px] font-medium text-white/60 hover:text-white/90 transition-colors disabled:opacity-40"
                    >
                      {remixing === item.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Use'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {items.map((item) => {
              const config = TYPE_CONFIG[item.type];
              const TypeIcon = config?.icon || Bot;
              
              return (
                <div
                  key={item.id}
                  onClick={() => router.push(`/library/${item.id}`)}
                  className="group flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  <div className={`w-10 h-10 rounded-lg ${config?.bg} border flex items-center justify-center flex-shrink-0`}>
                    <TypeIcon className={`w-5 h-5 ${config?.color}`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-white/90">{item.name}</h3>
                      {item.isVerified && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
                      <span className="text-[11px] text-white/30">by {item.author?.nickname || formatWallet(item.authorWallet)}</span>
                    </div>
                    <p className="text-xs text-white/40 truncate">{item.description}</p>
                  </div>
                  
                  {item.performance?.totalReturn !== undefined && (
                    <div className={`text-sm font-semibold ${item.performance.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {item.performance.totalReturn >= 0 ? '+' : ''}{item.performance.totalReturn.toFixed(1)}%
                    </div>
                  )}
                  
                  <div className="flex items-center gap-3 text-[11px] text-white/30">
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400/70" /> {item.avgRating.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitBranch className="w-3 h-3" /> {formatNumber(item.remixes)}
                    </span>
                  </div>
                  
                  <button
                    onClick={(e) => handleRemix(item.id, e)}
                    disabled={remixing === item.id || !wallet.isConnected}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium text-white/60 hover:text-white/90 transition-colors disabled:opacity-40"
                  >
                    {remixing === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-8">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                  page === p 
                    ? 'bg-white/10 text-white' 
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                }`}
              >
                {p}
              </button>
            ))}
            {totalPages > 5 && (
              <>
                <span className="text-white/20 px-1">...</span>
                <button
                  onClick={() => setPage(totalPages)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    page === totalPages 
                      ? 'bg-white/10 text-white' 
                      : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                  }`}
                >
                  {totalPages}
                </button>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
