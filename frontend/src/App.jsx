import React, { useState } from 'react';
import { Search, Download, MapPin, Star, Phone, Mail, Globe, ExternalLink, Utensils, Loader2, Sparkles } from 'lucide-react';

// Empty in local dev (Vite proxy handles /api). On Vercel set VITE_API_URL=https://your-backend.onrender.com
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setData(null);

    try {
      const response = await fetch(`${API_BASE}/api/restaurants?query=${encodeURIComponent(query)}`);

      // The backend can return non-JSON on crashes/proxy errors, so read text first
      const raw = await response.text();
      let result = null;
      try { result = JSON.parse(raw); } catch { /* not JSON */ }

      if (!response.ok) {
        throw new Error(
          (result && result.detail) ||
          `Request failed (${response.status}). The backend may be waking up (free hosting sleeps) - wait a minute and try again.`
        );
      }

      setData(result);
    } catch (err) {
      setError(err.message || 'An error occurred while connecting to backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!data || !data.restaurants.length) return;

    setExporting(true);
    try {
      const response = await fetch(`${API_BASE}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area: data.area, restaurants: data.restaurants })
      });

      if (!response.ok) throw new Error('Failed to generate excel sheet');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.area.replace(/[^a-zA-Z0-9]/g, '_')}_Restaurants.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Error downloading excel file.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-darknavy-900 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <header className="border-b border-blue-900/40 bg-darknavy-800/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <Utensils className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-blue-400 bg-clip-text text-transparent">
                FindMyRestaurant
              </h1>
              {/* <p className="text-xs text-blue-300/70 font-medium">Live Google Maps Explorer & Exporter</p> */}
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-xs bg-darknavy-700/60 border border-blue-900/50 px-3 py-1.5 rounded-full text-blue-200">
            {/* <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" /> */}
            {/* <span>Powered by Google Places API</span> */}
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl w-full mx-auto px-4 py-10 flex flex-col items-center">
        <div className="text-center max-w-2xl mb-8 animate-fade-in">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">
            Discover Top Restaurants Anywhere
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Enter a city name, area, or pin code to fetch live records, contact details, email addresses, and download Excel sheets.
          </p>
        </div>

        <form onSubmit={handleSearch} className="w-full max-w-2xl mb-12 animate-fade-in">
          <div className="relative flex items-center shadow-2xl shadow-blue-950/50 rounded-2xl p-1.5 bg-darknavy-800/90 border border-blue-800/50 focus-within:border-blue-500 transition-all duration-300">
            <div className="pl-4 text-blue-400">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Downtown Manhattan, 10001 or Bandra West, Mumbai"
              className="w-full bg-transparent px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none text-sm sm:text-base"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl font-medium text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <span>Explore</span>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="w-full max-w-4xl bg-red-950/40 border border-red-800/50 text-red-200 px-4 py-3 rounded-xl mb-6 text-sm animate-fade-in">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 animate-fade-in">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-500 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Utensils className="w-6 h-6 text-blue-400 animate-pulse" />
              </div>
            </div>
            <p className="text-slate-300 text-sm font-medium">Fetching live maps data & scraping restaurant websites for emails...</p>
          </div>
        )}

        {data && !loading && (
          <div className="w-full space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-darknavy-800/60 border border-blue-900/50 p-5 rounded-2xl gap-4 backdrop-blur-sm">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <span>Results for &ldquo;{data.area}&rdquo;</span>
                  <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-normal">
                    {data.count} found
                  </span>
                </h3>
              </div>

              <button
                onClick={handleDownloadExcel}
                disabled={exporting || data.restaurants.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-900/30 flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating Excel...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Excel Sheet</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.restaurants.map((item, index) => (
                <div
                  key={index}
                  className="bg-darknavy-800/80 border border-blue-900/40 hover:border-blue-600/60 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-blue-950/50 group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-semibold text-white group-hover:text-blue-300 transition-colors line-clamp-1">
                        {item.name}
                      </h4>
                      {item.rating !== 'N/A' && (
                        <div className="flex items-center space-x-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-amber-400 text-xs font-bold shrink-0">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          <span>{item.rating}</span>
                          <span className="text-slate-400 font-normal">({item.reviews_count})</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start space-x-2 text-slate-400 text-xs mb-4">
                      <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{item.address}</span>
                    </div>

                    <div className="space-y-2 border-t border-blue-900/40 pt-3 text-xs">
                      <div className="flex items-center space-x-2 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{item.phone}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate" title={item.email}>{item.email}</span>
                      </div>
                      {item.website !== 'N/A' && (
                        <div className="flex items-center space-x-2 text-blue-400 truncate">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <a
                            href={item.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline truncate"
                          >
                            {item.website}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-blue-900/40 flex items-center justify-between">
                    <a
                      href={item.maps_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform"
                    >
                      <span>View on Google Maps</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-blue-900/40 bg-darknavy-800/40 py-6 text-center text-xs text-slate-500">
        <p>FindMyRestaurant &bull; Live Google Maps Explorer</p>
      </footer>
    </div>
  );
}