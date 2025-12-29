'use client';

/**
 * Library Item Detail Page
 * 
 * View full details of a library item:
 * - Performance stats (verified on-chain)
 * - Strategy configuration
 * - Ratings and comments
 * - Remix button
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import {
  ArrowLeft,
  Bot,
  BarChart3,
  Layers,
  Sparkles,
  Star,
  Heart,
  GitBranch,
  Eye,
  CheckCircle,
  ExternalLink,
  MessageSquare,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  User,
  Calendar,
  Link2,
  Copy,
  Check,
} from 'lucide-react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

interface LibraryItem {
  id: string;
  authorWallet: string;
  type: string;
  name: string;
  description: string;
  config: any;
  tags: string[];
  symbol: string | null;
  performance: any;
  isVerified: boolean;
  verificationTxs: string[];
  views: number;
  likes: number;
  remixes: number;
  avgRating: number;
  totalRatings: number;
  createdAt: string;
  author: {
    walletAddress: string;
    nickname: string | null;
    avatarUrl: string | null;
  } | null;
  ratings: Array<{
    id: string;
    walletAddress: string;
    rating: number;
    review: string | null;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    walletAddress: string;
    content: string;
    createdAt: string;
  }>;
  sourceBot: {
    id: string;
    name: string;
    totalTrades: number;
    totalPnlPct: number;
  } | null;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  BOT: { icon: Bot, color: 'from-indigo-500 to-purple-600', label: 'Bot' },
  STRATEGY: { icon: Layers, color: 'from-emerald-500 to-teal-600', label: 'Strategy' },
  TEMPLATE: { icon: Sparkles, color: 'from-amber-500 to-orange-600', label: 'Template' },
  BACKTEST: { icon: BarChart3, color: 'from-purple-500 to-pink-600', label: 'Backtest' },
};

export default function LibraryItemPage() {
  const router = useRouter();
  const params = useParams();
  const { wallet } = useWallet();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [remixing, setRemixing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Rating
  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  
  // Comment
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchItem();
    }
  }, [params.id]);

  const fetchItem = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/library/${params.id}`);
      const data = await res.json();
      
      if (data.success) {
        setItem(data.item);
      } else {
        router.push('/library');
      }
    } catch (error) {
      console.error('Failed to fetch item:', error);
      router.push('/library');
    } finally {
      setLoading(false);
    }
  };

  const handleRemix = async () => {
    if (!wallet.isConnected) {
      alert('Please connect your wallet to remix');
      return;
    }
    
    setRemixing(true);
    try {
      const res = await fetch(`${API_URL}/api/library/${params.id}/remix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      const data = await res.json();
      
      if (data.success) {
        router.push(`/bots/${data.bot.id}`);
      } else {
        alert(data.error || 'Failed to remix');
      }
    } catch (error) {
      console.error('Failed to remix:', error);
    } finally {
      setRemixing(false);
    }
  };

  const handleLike = async () => {
    if (!wallet.isConnected || !item) return;
    
    try {
      await fetch(`${API_URL}/api/library/${item.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.address }),
      });
      fetchItem();
    } catch (error) {
      console.error('Failed to like:', error);
    }
  };

  const handleSubmitRating = async () => {
    if (!wallet.isConnected || !item || userRating === 0) return;
    
    setSubmittingRating(true);
    try {
      await fetch(`${API_URL}/api/library/${item.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          rating: userRating,
          review: userReview || undefined,
        }),
      });
      setUserRating(0);
      setUserReview('');
      fetchItem();
    } catch (error) {
      console.error('Failed to submit rating:', error);
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!wallet.isConnected || !item || !newComment.trim()) return;
    
    setSubmittingComment(true);
    try {
      await fetch(`${API_URL}/api/library/${item.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: wallet.address,
          content: newComment,
        }),
      });
      setNewComment('');
      fetchItem();
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatWallet = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (!item) {
    return null;
  }

  const typeConfig = TYPE_CONFIG[item.type] || TYPE_CONFIG.BOT;
  const TypeIcon = typeConfig.icon;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => router.push('/library')} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Library</span>
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={copyLink}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />}
            </button>
            
            <button
              onClick={handleRemix}
              disabled={remixing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-medium transition-all disabled:opacity-50"
            >
              {remixing ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
              Remix
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Hero */}
        <div className="flex items-start gap-6 mb-8">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${typeConfig.color} flex items-center justify-center flex-shrink-0`}>
            <TypeIcon className="w-10 h-10 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">{item.name}</h1>
              {item.isVerified && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Verified
                </div>
              )}
            </div>
            
            <p className="text-white/60 mb-4">{item.description}</p>
            
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-white/40">
                <User className="w-4 h-4" />
                <span>{item.author?.nickname || formatWallet(item.authorWallet)}</span>
              </div>
              <div className="flex items-center gap-2 text-white/40">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(item.createdAt)}</span>
              </div>
              {item.symbol && (
                <div className="flex items-center gap-2 text-white/40">
                  <Target className="w-4 h-4" />
                  <span>{item.symbol}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
              <Star className="w-5 h-5" />
              <span className="text-xl font-bold">{item.avgRating.toFixed(1)}</span>
            </div>
            <div className="text-xs text-white/40">{item.totalRatings} ratings</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="flex items-center justify-center gap-1 text-red-400 mb-1">
              <Heart className="w-5 h-5" />
              <span className="text-xl font-bold">{item.likes}</span>
            </div>
            <div className="text-xs text-white/40">likes</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="flex items-center justify-center gap-1 text-indigo-400 mb-1">
              <GitBranch className="w-5 h-5" />
              <span className="text-xl font-bold">{item.remixes}</span>
            </div>
            <div className="text-xs text-white/40">remixes</div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
            <div className="flex items-center justify-center gap-1 text-white mb-1">
              <Eye className="w-5 h-5" />
              <span className="text-xl font-bold">{item.views}</span>
            </div>
            <div className="text-xs text-white/40">views</div>
          </div>
          <button
            onClick={handleLike}
            className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-red-500/50 transition-colors text-center"
          >
            <Heart className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <div className="text-xs text-white/40">Like this</div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Performance */}
            {item.performance && (
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  Performance
                  {item.isVerified && (
                    <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      On-chain verified
                    </span>
                  )}
                </h2>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {item.performance.totalReturn !== undefined && (
                    <div>
                      <div className="text-xs text-white/40 mb-1">Total Return</div>
                      <div className={`text-xl font-bold ${item.performance.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.performance.totalReturn >= 0 ? '+' : ''}{item.performance.totalReturn.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  {item.performance.winRate !== undefined && (
                    <div>
                      <div className="text-xs text-white/40 mb-1">Win Rate</div>
                      <div className="text-xl font-bold text-white">{item.performance.winRate.toFixed(1)}%</div>
                    </div>
                  )}
                  {item.performance.sharpeRatio !== undefined && (
                    <div>
                      <div className="text-xs text-white/40 mb-1">Sharpe Ratio</div>
                      <div className="text-xl font-bold text-white">{item.performance.sharpeRatio.toFixed(2)}</div>
                    </div>
                  )}
                  {item.performance.maxDrawdown !== undefined && (
                    <div>
                      <div className="text-xs text-white/40 mb-1">Max Drawdown</div>
                      <div className="text-xl font-bold text-amber-400">-{item.performance.maxDrawdown.toFixed(2)}%</div>
                    </div>
                  )}
                </div>
                
                {item.verificationTxs.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-xs text-white/40 mb-2">Verification Transactions</div>
                    <div className="flex flex-wrap gap-2">
                      {item.verificationTxs.slice(0, 3).map((tx, i) => (
                        <a
                          key={i}
                          href={`https://app.hyperliquid.xyz/explorer/tx/${tx}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 text-xs text-white/60 hover:text-white transition-colors"
                        >
                          {tx.slice(0, 8)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Strategy Config */}
            {item.config && (
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  Strategy Configuration
                </h2>
                
                {item.config.indicators && (
                  <div className="mb-4">
                    <div className="text-sm text-white/60 mb-2">Indicators</div>
                    <div className="flex flex-wrap gap-2">
                      {item.config.indicators.map((ind: any, i: number) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-400 text-sm">
                          {ind.name}({Object.values(ind.params || {}).join(',')})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {item.config.entryConditions && item.config.entryConditions.length > 0 && (
                  <div className="mb-4">
                    <div className="text-sm text-white/60 mb-2">Entry Conditions</div>
                    <div className="space-y-1">
                      {item.config.entryConditions.map((cond: any, i: number) => (
                        <div key={i} className="text-sm text-white/80">
                          <span className="text-emerald-400">IF</span> {cond.indicator} {cond.operator} {cond.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {item.config.exitConditions && item.config.exitConditions.length > 0 && (
                  <div>
                    <div className="text-sm text-white/60 mb-2">Exit Conditions</div>
                    <div className="space-y-1">
                      {item.config.exitConditions.map((cond: any, i: number) => (
                        <div key={i} className="text-sm text-white/80">
                          <span className="text-red-400">EXIT IF</span> {cond.indicator} {cond.operator} {cond.value}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Comments */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-400" />
                Comments ({item.comments.length})
              </h2>
              
              {/* Add Comment */}
              {wallet.isConnected && (
                <div className="flex gap-3 mb-6">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-4 py-2 rounded-xl bg-black/30 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                  />
                  <button
                    onClick={handleSubmitComment}
                    disabled={submittingComment || !newComment.trim()}
                    className="px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 transition-colors disabled:opacity-50"
                  >
                    {submittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
              
              {/* Comments List */}
              {item.comments.length === 0 ? (
                <p className="text-white/40 text-sm">No comments yet. Be the first!</p>
              ) : (
                <div className="space-y-4">
                  {item.comments.map((comment) => (
                    <div key={comment.id} className="p-3 rounded-xl bg-black/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm text-white/60">{formatWallet(comment.walletAddress)}</span>
                        <span className="text-xs text-white/30">{formatDate(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-white/80">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tags */}
            {item.tags.length > 0 && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/60 mb-2">Tags</div>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-white/5 text-white/60 text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Rate */}
            {wallet.isConnected && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/60 mb-3">Rate this {typeConfig.label.toLowerCase()}</div>
                <div className="flex gap-1 mb-3">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setUserRating(star)}
                      className={`p-1 ${userRating >= star ? 'text-amber-400' : 'text-white/20'} hover:text-amber-400 transition-colors`}
                    >
                      <Star className="w-6 h-6" fill={userRating >= star ? 'currentColor' : 'none'} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={userReview}
                  onChange={(e) => setUserReview(e.target.value)}
                  placeholder="Write a review (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-white/30 text-sm resize-none focus:outline-none focus:border-amber-500/50"
                  rows={3}
                />
                <button
                  onClick={handleSubmitRating}
                  disabled={submittingRating || userRating === 0}
                  className="w-full mt-3 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-medium transition-colors disabled:opacity-50"
                >
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </button>
              </div>
            )}

            {/* Recent Ratings */}
            {item.ratings.length > 0 && (
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-sm text-white/60 mb-3">Recent Reviews</div>
                <div className="space-y-3">
                  {item.ratings.slice(0, 5).map((rating) => (
                    <div key={rating.id} className="pb-3 border-b border-white/5 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-3 h-3 ${rating.rating >= star ? 'text-amber-400' : 'text-white/20'}`}
                              fill={rating.rating >= star ? 'currentColor' : 'none'}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-white/40">{formatWallet(rating.walletAddress)}</span>
                      </div>
                      {rating.review && (
                        <p className="text-xs text-white/60">{rating.review}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
