import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Image as ImageIcon, 
  Tag as TagIcon, 
  Plus, 
  X, 
  Maximize2, 
  Info, 
  Calendar, 
  Sun, 
  Moon, 
  ChevronRight, 
  RefreshCw,
  Settings as SettingsIcon
} from 'lucide-react';

export default function App() {
  const [images, setImages] = useState([]);
  const [limit] = useState(24);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  
  // UI states
  const [selectedImage, setSelectedImage] = useState(null);
  const [fullImageSrc, setFullImageSrc] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [newTagText, setNewTagText] = useState('');
  
  // AI processing loading states
  const [aiDescribing, setAiDescribing] = useState(false);
  const [aiTagging, setAiTagging] = useState(false);
  const [aiClassifying, setAiClassifying] = useState(false);
  
  // AI settings states
  const [showSettings, setShowSettings] = useState(false);
  const [settingsHost, setSettingsHost] = useState('http://localhost:11414');
  const [settingsModel, setSettingsModel] = useState('gemma4:latest');
  
  const classifications = [
    'nature', 'people', 'screenshots', 'diagrams', 'nsfw', 'memes', 'other'
  ];

  const loaderRef = useRef(null);

  // Toggle Dark Mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
      document.body.style.backgroundColor = '#1C1917';
      document.body.style.color = '#E7E5E4';
    } else {
      document.body.classList.remove('dark');
      document.body.style.backgroundColor = '#F4EFEA';
      document.body.style.color = '#3C2F2F';
    }
  }, [darkMode]);

  // Load AI settings on mount with defaults
  useEffect(() => {
    window.api.getSettings()
      .then((settings) => {
        setSettingsHost(settings?.ollama_host || 'http://localhost:11414');
        setSettingsModel(settings?.ollama_model || 'gemma4:latest');
      })
      .catch((err) => {
        console.error('Error loading AI settings on mount:', err);
      });
  }, []);

  // Re-fetch saved settings whenever settings modal is opened
  useEffect(() => {
    if (showSettings) {
      window.api.getSettings()
        .then((settings) => {
          setSettingsHost(settings?.ollama_host || 'http://localhost:11414');
          setSettingsModel(settings?.ollama_model || 'gemma4:latest');
        })
        .catch((err) => {
          console.error('Error loading AI settings on modal open:', err);
        });
    }
  }, [showSettings]);

  // Reset offset and fetch when filters change
  useEffect(() => {
    setImages([]);
    setOffset(0);
    setHasMore(true);
    fetchImages(0, true);
  }, [searchTerm, selectedClass, selectedTag]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const target = entries[0];
      if (target.isIntersecting && hasMore && !loading) {
        setOffset((prevOffset) => {
          const nextOffset = prevOffset + limit;
          fetchImages(nextOffset, false);
          return nextOffset;
        });
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => {
      if (loaderRef.current) {
        observer.unobserve(loaderRef.current);
      }
    };
  }, [hasMore, loading, offset]);

  // Fetch Full Resolution Image via IPC
  useEffect(() => {
    if (selectedImage) {
      setFullImageSrc('');
      window.api.getImageFile(selectedImage.image_hash)
        .then((base64Data) => {
          const ext = selectedImage.extension === 'jpg' ? 'jpeg' : selectedImage.extension.toLowerCase();
          setFullImageSrc(`data:image/${ext};base64,${base64Data}`);
        })
        .catch((err) => {
          console.error('Error fetching full resolution image:', err);
        });
    }
  }, [selectedImage]);

  // Fetch Images via direct Electron IPC
  const fetchImages = async (currentOffset, reset = false) => {
    if (loading) return;
    setLoading(true);
    
    try {
      const data = await window.api.getImages({
        limit,
        offset: currentOffset,
        classification: selectedClass,
        tag: selectedTag,
        search: searchTerm
      });
      
      if (data.length < limit) {
        setHasMore(false);
      }
      
      if (reset) {
        setImages(data);
      } else {
        setImages((prev) => [...prev, ...data]);
      }
    } catch (err) {
      console.error('Error fetching images:', err);
    } finally {
      setLoading(false);
    }
  };

  // Import Image from URL
  const handleImport = async (e) => {
    e.preventDefault();
    if (!importUrl) return;
    setImporting(true);
    
    try {
      const data = await window.api.importWebImage(importUrl);
      if (data.status === 'success') {
        setImportUrl('');
        alert('Image imported successfully!');
        // Refresh grid
        setImages([]);
        setOffset(0);
        setHasMore(true);
        fetchImages(0, true);
      } else {
        alert('Failed to import image.');
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Error importing image.');
    } finally {
      setImporting(false);
    }
  };

  // Add Tag
  const handleAddTag = async (e) => {
    e.preventDefault();
    if (!newTagText || !selectedImage) return;
    const cleanTag = newTagText.trim().toLowerCase();
    
    const currentTags = selectedImage.tags ? [...selectedImage.tags] : [];
    if (currentTags.includes(cleanTag)) {
      setNewTagText('');
      return;
    }
    
    const updatedTags = [...currentTags, cleanTag];
    await saveTags(updatedTags);
  };

  // Remove Tag
  const handleRemoveTag = async (tagToRemove) => {
    if (!selectedImage) return;
    const updatedTags = selectedImage.tags.filter(t => t !== tagToRemove);
    await saveTags(updatedTags);
  };

  // Save Tags via IPC
  const saveTags = async (updatedTags) => {
    try {
      const data = await window.api.updateImageTags({
        imageHash: selectedImage.image_hash,
        tags: updatedTags,
        origin: selectedImage.origin
      });
      
      if (data.status === 'success') {
        const updatedImage = { ...selectedImage, tags: updatedTags };
        setSelectedImage(updatedImage);
        setImages(images.map(img => img.image_hash === selectedImage.image_hash ? updatedImage : img));
        setNewTagText('');
      } else {
        alert('Failed to update tags.');
      }
    } catch (err) {
      console.error('Error updating tags:', err);
    }
  };

  // AI Description Trigger
  const handleAIDescribe = async () => {
    if (!selectedImage || aiDescribing) return;
    setAiDescribing(true);
    try {
      const data = await window.api.aiDescribeImage({
        imageHash: selectedImage.image_hash,
        origin: selectedImage.origin
      });
      if (data.status === 'success') {
        const updatedImage = { ...selectedImage, description: data.description };
        setSelectedImage(updatedImage);
        setImages(images.map(img => img.image_hash === selectedImage.image_hash ? updatedImage : img));
      } else {
        alert('Failed to generate AI description.');
      }
    } catch (err) {
      console.error('Error generating AI description:', err);
      alert(`Error generating AI description: ${err.message}`);
    } finally {
      setAiDescribing(false);
    }
  };

  // AI Tagging Trigger
  const handleAITag = async () => {
    if (!selectedImage || aiTagging) return;
    setAiTagging(true);
    try {
      const data = await window.api.aiTagImage({
        imageHash: selectedImage.image_hash,
        origin: selectedImage.origin
      });
      if (data.status === 'success') {
        const updatedImage = { ...selectedImage, tags: data.tags };
        setSelectedImage(updatedImage);
        setImages(images.map(img => img.image_hash === selectedImage.image_hash ? updatedImage : img));
      } else {
        alert('Failed to generate AI tags.');
      }
    } catch (err) {
      console.error('Error generating AI tags:', err);
      alert(`Error generating AI tags: ${err.message}`);
    } finally {
      setAiTagging(false);
    }
  };

  // AI Classification Trigger
  const handleAIClassify = async () => {
    if (!selectedImage || aiClassifying) return;
    setAiClassifying(true);
    try {
      const data = await window.api.aiClassifyImage({
        imageHash: selectedImage.image_hash,
        origin: selectedImage.origin
      });
      if (data.status === 'success') {
        const updatedImage = { ...selectedImage, classification: data.classification };
        setSelectedImage(updatedImage);
        setImages(images.map(img => img.image_hash === selectedImage.image_hash ? updatedImage : img));
      } else {
        alert('Failed to classify image with AI.');
      }
    } catch (err) {
      console.error('Error classifying image with AI:', err);
      alert(`Error classifying image with AI: ${err.message}`);
    } finally {
      setAiClassifying(false);
    }
  };

  // Save settings via IPC
  const handleSaveSettings = async () => {
    try {
      await window.api.saveSettings({
        ollama_host: settingsHost,
        ollama_model: settingsModel
      });
      alert('AI settings saved successfully.');
      setShowSettings(false);
    } catch (err) {
      console.error('Error saving AI settings:', err);
      alert(`Error saving settings: ${err.message}`);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper for generating base64 thumbnail src safely
  const getThumbnailSrc = (img) => {
    if (!img.thumbnail) return '';
    return img.thumbnail.startsWith('data:') ? img.thumbnail : `data:image/jpeg;base64,${img.thumbnail}`;
  };

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'dark bg-retro-bg-dark text-retro-text-dark' : 'bg-retro-bg-light text-retro-text-light'} transition-colors duration-200 overflow-hidden`}>
      
      {/* Header */}
      <header className="border-b border-retro-border-light dark:border-retro-border-dark py-4 px-6 flex items-center justify-between sticky top-0 bg-retro-bg-light/95 dark:bg-retro-bg-dark/95 backdrop-blur z-20">
        <div className="flex items-center space-x-3">
          <div className="bg-retro-orange p-2 rounded text-white shadow-sm">
            <ImageIcon size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">kb-image</h1>
            <p className="text-xs opacity-60">Knowledge-Base Desktop Explorer</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <form onSubmit={handleImport} className="hidden md:flex items-center space-x-2">
            <input
              type="text"
              placeholder="Import image URL..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="px-3 py-1.5 text-sm bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors"
            />
            <button
              type="submit"
              disabled={importing}
              className="bg-retro-orange hover:bg-retro-orange/90 text-white text-sm px-3 py-1.5 rounded transition-colors disabled:opacity-50 flex items-center space-x-1"
            >
              {importing ? <RefreshCw className="animate-spin" size={14} /> : <Plus size={14} />}
              <span>Import</span>
            </button>
          </form>

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded-full transition-colors"
            title="Toggle theme"
          >
            {darkMode ? <Sun size={18} className="text-retro-yellow" /> : <Moon size={18} className="text-retro-blue" />}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded-full transition-colors text-retro-text-light dark:text-retro-text-dark"
            title="AI Settings"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 p-6 border-r border-retro-border-light dark:border-retro-border-dark flex flex-col space-y-6 md:overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search filenames..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors"
              />
              <Search className="absolute left-3 top-2.5 text-retro-text-light/50 dark:text-retro-text-dark/50" size={16} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Classifications</label>
            <div className="flex flex-col space-y-1">
              <button
                onClick={() => setSelectedClass('')}
                className={`text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${!selectedClass ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
              >
                <span>All Images</span>
                <ChevronRight size={14} className={!selectedClass ? 'opacity-100' : 'opacity-0'} />
              </button>
              {classifications.map((cls) => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`text-left px-3 py-2 rounded text-sm capitalize transition-colors flex items-center justify-between ${selectedClass === cls ? 'bg-retro-panel-light dark:bg-retro-panel-dark font-medium text-retro-orange' : 'hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50'}`}
                >
                  <span>{cls}</span>
                  <ChevronRight size={14} className={selectedClass === cls ? 'opacity-100' : 'opacity-0'} />
                </button>
              ))}
            </div>
          </div>

          {selectedTag && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Active Filter</label>
              <div className="bg-retro-panel-light dark:bg-retro-panel-dark p-3 rounded border border-retro-border-light dark:border-retro-border-dark flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-retro-blue">
                  <TagIcon size={14} />
                  <span className="font-semibold">{selectedTag}</span>
                </div>
                <button 
                  onClick={() => setSelectedTag('')}
                  className="hover:text-retro-red transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-retro-border-light dark:border-retro-border-dark mt-auto text-xs opacity-55">
            <p>Database: sqlite (direct)</p>
            <p>Records: {images.length} visible</p>
          </div>
        </aside>

        {/* Grid List */}
        <main className="flex-1 p-6 flex flex-col md:overflow-y-auto">
          
          <form onSubmit={handleImport} className="md:hidden flex items-center space-x-2 mb-6">
            <input
              type="text"
              placeholder="Import image URL..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              className="flex-1 px-3 py-2 text-sm bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none"
            />
            <button
              type="submit"
              disabled={importing}
              className="bg-retro-orange text-white px-4 py-2 rounded text-sm font-semibold disabled:opacity-50"
            >
              Import
            </button>
          </form>

          {images.length === 0 && !loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <ImageIcon className="opacity-30 mb-4" size={48} />
              <h3 className="text-lg font-semibold">No images found</h3>
              <p className="text-sm opacity-60 max-w-sm mt-1">Import new web images or scan local directories using the Python CLI tool.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
              {images.map((img) => (
                <div
                  key={img.image_hash}
                  onClick={() => setSelectedImage(img)}
                  className="group cursor-pointer bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden shadow-sm hover:shadow-md hover:border-retro-orange/60 dark:hover:border-retro-orange/60 transition-all duration-200 flex flex-col"
                >
                  <div className="relative aspect-square w-full bg-stone-200 dark:bg-stone-800 flex items-center justify-center overflow-hidden">
                    <img
                      src={getThumbnailSrc(img)}
                      alt={img.file_name}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-200"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 text-white text-[10px] space-y-0.5">
                      <p className="font-semibold truncate">{img.file_name}</p>
                      <p>{img.width} × {img.hight} px</p>
                      <p>{formatSize(img.size)}</p>
                    </div>
                  </div>
                  
                  <div className="p-2 border-t border-retro-border-light/40 dark:border-retro-border-dark/40 flex-1 flex flex-col justify-between">
                    <span className="text-xs font-semibold truncate block">{img.file_name}</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] uppercase font-bold tracking-wide opacity-50">{img.origin}</span>
                      {img.classification && (
                        <span className="text-[9px] bg-retro-orange/10 dark:bg-retro-orange/20 text-retro-orange px-1.5 py-0.5 rounded capitalize font-medium">{img.classification}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div ref={loaderRef} className="py-8 flex justify-center">
            {loading && (
              <RefreshCw className="animate-spin text-retro-orange" size={24} />
            )}
          </div>
        </main>
      </div>

      {/* Detail drawer */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex justify-end z-50 transition-opacity">
          <div className="absolute inset-0" onClick={() => setSelectedImage(null)} />
          <div className="relative w-full max-w-2xl bg-retro-bg-light dark:bg-retro-bg-dark h-full shadow-2xl flex flex-col border-l border-retro-border-light dark:border-retro-border-dark animate-slide-in">
            
            <div className="p-4 border-b border-retro-border-light dark:border-retro-border-dark flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ImageIcon className="text-retro-orange" size={18} />
                <h2 className="font-bold truncate max-w-md">{selectedImage.file_name}</h2>
              </div>
              <button 
                onClick={() => setSelectedImage(null)}
                className="p-1.5 hover:bg-retro-panel-light dark:hover:bg-retro-panel-dark rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden bg-stone-200 dark:bg-stone-800 flex items-center justify-center max-h-96 shadow-inner relative group">
                {fullImageSrc ? (
                  <img 
                    src={fullImageSrc} 
                    alt={selectedImage.file_name}
                    className="max-h-96 object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-12">
                    <RefreshCw className="animate-spin text-retro-orange mb-2" size={24} />
                    <span className="text-xs opacity-60">Reading raw database file...</span>
                  </div>
                )}
                
                {fullImageSrc && (
                  <div className="absolute top-2 right-2 flex space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a 
                      href={fullImageSrc}
                      download={selectedImage.file_name}
                      className="p-2 bg-black/60 hover:bg-black/85 text-white rounded transition-colors"
                      title="Download image"
                    >
                      <Maximize2 size={16} />
                    </a>
                  </div>
                )}
              </div>

              <div className="bg-retro-panel-light dark:bg-retro-panel-dark p-4 rounded border border-retro-border-light dark:border-retro-border-dark grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50 flex items-center space-x-1">
                    <Info size={10} />
                    <span>Dimensions</span>
                  </span>
                  <p className="text-sm font-semibold">{selectedImage.width} × {selectedImage.hight} px</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50">File Size</span>
                  <p className="text-sm font-semibold">{formatSize(selectedImage.size)}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50">Extension</span>
                  <p className="text-sm uppercase font-semibold">{selectedImage.extension}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50 flex items-center space-x-1">
                    <Calendar size={10} />
                    <span>Created</span>
                  </span>
                  <p className="text-xs truncate font-medium">{new Date(selectedImage.created).toLocaleDateString()}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50">Classification</span>
                  <p className="text-xs font-semibold capitalize text-retro-orange">{selectedImage.classification || 'Unclassified'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-50">Origin</span>
                  <p className="text-xs font-semibold capitalize">{selectedImage.origin} storage</p>
                </div>
              </div>

              {/* AI Actions */}
              <div className="space-y-2 pt-2 border-t border-retro-border-light/40 dark:border-retro-border-dark/40">
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center space-x-1.5">
                  <RefreshCw size={14} className="text-retro-orange" />
                  <span>AI Actions (Ollama)</span>
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={handleAIDescribe}
                    disabled={aiDescribing}
                    className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange rounded text-xs transition-colors disabled:opacity-50 text-retro-text-light dark:text-retro-text-dark"
                  >
                    {aiDescribing && <RefreshCw className="animate-spin text-retro-orange mr-1" size={12} />}
                    <span>Describe Image</span>
                  </button>
                  <button
                    onClick={handleAITag}
                    disabled={aiTagging}
                    className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange rounded text-xs transition-colors disabled:opacity-50 text-retro-text-light dark:text-retro-text-dark"
                  >
                    {aiTagging && <RefreshCw className="animate-spin text-retro-orange mr-1" size={12} />}
                    <span>Generate Tags</span>
                  </button>
                  <button
                    onClick={handleAIClassify}
                    disabled={aiClassifying}
                    className="flex items-center justify-center space-x-1.5 py-2 px-3 bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange rounded text-xs transition-colors disabled:opacity-50 text-retro-text-light dark:text-retro-text-dark"
                  >
                    {aiClassifying && <RefreshCw className="animate-spin text-retro-orange mr-1" size={12} />}
                    <span>Classify Image</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-60">Image Description</h3>
                <div className="bg-retro-panel-light/40 dark:bg-retro-panel-dark/40 p-4 rounded border border-retro-border-light/50 dark:border-retro-border-dark/50">
                  <p className="text-sm leading-relaxed italic opacity-95">
                    {selectedImage.description || 'No description generated for this image yet.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-60 flex items-center space-x-1.5">
                  <TagIcon size={14} />
                  <span>Metadata Tags</span>
                </h3>
                
                <div className="flex flex-wrap gap-2">
                  {selectedImage.tags && selectedImage.tags.length > 0 ? (
                    selectedImage.tags.map((tag) => (
                      <span 
                        key={tag} 
                        className="inline-flex items-center space-x-1.5 bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark px-2.5 py-1 rounded text-xs"
                      >
                        <button 
                          onClick={() => {
                            setSelectedTag(tag);
                            setSelectedImage(null);
                          }}
                          className="hover:text-retro-orange transition-colors font-medium"
                        >
                          {tag}
                        </button>
                        <button 
                          onClick={() => handleRemoveTag(tag)}
                          className="text-retro-text-light/40 dark:text-retro-text-dark/40 hover:text-retro-red dark:hover:text-retro-red transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs italic opacity-60">No tags assigned.</span>
                  )}
                </div>

                <form onSubmit={handleAddTag} className="flex items-center space-x-2 pt-1.5">
                  <input
                    type="text"
                    placeholder="Add new tag..."
                    value={newTagText}
                    onChange={(e) => setNewTagText(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors flex-1"
                  />
                  <button
                    type="submit"
                    className="bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark hover:border-retro-orange p-1.5 rounded transition-colors text-retro-text-light dark:text-retro-text-dark"
                  >
                    <Plus size={16} />
                  </button>
                </form>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold uppercase tracking-wider opacity-60">EXIF Metadata</h3>
                <div className="border border-retro-border-light dark:border-retro-border-dark rounded overflow-hidden divide-y divide-retro-border-light dark:divide-retro-border-dark text-xs">
                  {selectedImage.exif_data && Object.keys(selectedImage.exif_data).length > 0 ? (
                    Object.entries(selectedImage.exif_data).map(([key, val]) => (
                      <div key={key} className="flex py-2 px-3 hover:bg-retro-panel-light/20 dark:hover:bg-retro-panel-dark/20">
                        <span className="w-1/3 font-semibold opacity-70 truncate" title={key}>{key}</span>
                        <span className="w-2/3 truncate" title={String(val)}>{String(val)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="py-3 px-3 italic opacity-65">No EXIF tags present.</div>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-retro-bg-light dark:bg-retro-bg-dark border border-retro-border-light dark:border-retro-border-dark p-6 rounded shadow-2xl w-full max-w-md space-y-4 text-retro-text-light dark:text-retro-text-dark">
            <div className="flex items-center justify-between border-b border-retro-border-light dark:border-retro-border-dark pb-3">
              <h2 className="text-lg font-bold flex items-center space-x-2">
                <SettingsIcon size={18} className="text-retro-orange" />
                <span>AI Connection Settings</span>
              </h2>
              <button 
                onClick={() => setShowSettings(false)}
                className="hover:text-retro-red transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Ollama Host</label>
                <input
                  type="text"
                  value={settingsHost}
                  onChange={(e) => setSettingsHost(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors"
                  placeholder="e.g. http://localhost:11414"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wider opacity-60">Ollama Model</label>
                <input
                  type="text"
                  value={settingsModel}
                  onChange={(e) => setSettingsModel(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-retro-panel-light dark:bg-retro-panel-dark border border-retro-border-light dark:border-retro-border-dark rounded focus:outline-none focus:border-retro-orange transition-colors"
                  placeholder="e.g. gemma4:latest"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2 border-t border-retro-border-light dark:border-retro-border-dark">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-xs border border-retro-border-light dark:border-retro-border-dark hover:bg-retro-panel-light/50 dark:hover:bg-retro-panel-dark/50 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-xs bg-retro-orange hover:bg-retro-orange/90 text-white rounded transition-colors font-medium shadow-sm"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
