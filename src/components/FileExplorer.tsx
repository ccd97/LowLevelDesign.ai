import React, { useState } from 'react';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FilePlus, 
  FolderPlus, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  ChevronDown,
  Check,
  X,
  RefreshCw,
  GripVertical
} from 'lucide-react';
import { FileItem } from '../types/session';
import { buildFileTree, TreeNode } from '../utils/fileTree';

interface FileExplorerProps {
  files: FileItem[];
  activeFilePath?: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (filePath: string) => void;
  onCreateFolder: (folderPath: string) => void;
  onRenameFile: (oldPath: string, newPath: string) => void;
  onDeleteFile: (path: string) => void;
  onRefresh?: () => void;
}

interface CreationState {
  parentPath: string; // '' for root, or relative folder path e.g. "src" or "models"
  isFolder: boolean;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  files,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  onRefresh,
}) => {
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [creationState, setCreationState] = useState<CreationState | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renamingNewName, setRenamingNewName] = useState('');

  // Drag and Drop state
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tree = buildFileTree(files);

  const toggleFolder = (path: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const startCreating = (parentPath: string, isFolder: boolean) => {
    setCreationState({ parentPath, isFolder });
    setNewItemName('');
    if (parentPath) {
      setCollapsedFolders((prev) => ({ ...prev, [parentPath]: false }));
      setSelectedFolderPath(parentPath);
    }
  };

  const handleCreateSubmit = () => {
    if (!creationState) return;
    const name = newItemName.trim();
    if (!name) {
      setCreationState(null);
      return;
    }
    const cleanName = name.replace(/^\/+|\/+$/g, '');
    const fullPath = creationState.parentPath
      ? `${creationState.parentPath}/${cleanName}`
      : cleanName;

    const isFolder = creationState.isFolder;
    // Clear state immediately to prevent re-entry on blur
    setNewItemName('');
    setCreationState(null);

    if (isFolder) {
      onCreateFolder(fullPath);
      setCollapsedFolders((prev) => ({ ...prev, [fullPath]: false }));
      setSelectedFolderPath(fullPath);
    } else {
      onCreateFile(fullPath);
    }
  };

  const handleRenameSubmit = (oldPath: string, isFolder: boolean) => {
    const targetName = renamingNewName.trim().replace(/^\/+|\/+$/g, '');
    setRenamingPath(null);
    if (!targetName) return;

    const parent = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parent ? `${parent}/${targetName}` : targetName;
    if (newPath === oldPath) return;

    onRenameFile(oldPath, newPath);

    if (isFolder) {
      if (selectedFolderPath === oldPath) {
        setSelectedFolderPath(newPath);
      }
      setCollapsedFolders((prev) => {
        const next = { ...prev };
        if (oldPath in next) {
          next[newPath] = next[oldPath];
          delete next[oldPath];
        }
        return next;
      });
    }
  };

  const handleRenameFileSubmit = (oldPath: string) => handleRenameSubmit(oldPath, false);
  const handleRenameFolderSubmit = (oldFolderPath: string) => handleRenameSubmit(oldFolderPath, true);

  // Drag and Drop move handler
  const handleDrop = (sourcePath: string, targetFolderPath: string) => {
    setDraggedPath(null);
    setDropTarget(null);

    if (!sourcePath) return;
    if (sourcePath === targetFolderPath) return;
    // Cannot move a folder into its own subfolder
    if (targetFolderPath && targetFolderPath.startsWith(`${sourcePath}/`)) return;

    const baseName = sourcePath.split('/').pop() || sourcePath;
    const newPath = targetFolderPath ? `${targetFolderPath}/${baseName}` : baseName;
    if (newPath === sourcePath) return;

    onRenameFile(sourcePath, newPath);

    if (targetFolderPath) {
      setCollapsedFolders((prev) => ({ ...prev, [targetFolderPath]: false }));
      setSelectedFolderPath(targetFolderPath);
    }
  };

  const renderCreationInput = (depth: number, parentPath: string) => {
    if (!creationState || creationState.parentPath !== parentPath) return null;

    return (
      <div
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className="py-1 px-2 flex items-center gap-1.5 bg-slate-100 dark:bg-zinc-900 border-l-2 border-blue-500 my-0.5 rounded-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {creationState.isFolder ? (
          <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
        ) : (
          <FileCode className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
        )}
        <input
          type="text"
          value={newItemName}
          autoFocus
          placeholder={creationState.isFolder ? 'folder_name' : 'filename.ext'}
          onChange={(e) => setNewItemName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreateSubmit();
            if (e.key === 'Escape') setCreationState(null);
          }}
          onBlur={handleCreateSubmit}
          className="flex-1 bg-white dark:bg-zinc-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-zinc-100 outline-none"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCreateSubmit}
          title="Create"
          className="p-0.5 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-colors"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setCreationState(null)}
          title="Cancel"
          className="p-0.5 text-rose-600 dark:text-rose-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isCollapsed = Boolean(collapsedFolders[node.path]);
    const isActive = activeFilePath === node.path;
    const isSelectedFolder = selectedFolderPath === node.path;
    const isRenaming = renamingPath === node.path;
    const isBeingDragged = draggedPath === node.path;
    const isDropOverThis = dropTarget === node.path;

    if (node.isDirectory) {
      // Validate whether the currently dragged item can be dropped here
      const canDropHere = Boolean(
        draggedPath &&
        draggedPath !== node.path &&
        !node.path.startsWith(`${draggedPath}/`)
      );

      return (
        <div key={node.path} className="select-none">
          <div
            draggable={!isRenaming}
            onDragStart={(e) => {
              e.stopPropagation();
              setDraggedPath(node.path);
              e.dataTransfer.setData('text/plain', node.path);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedPath(null);
              setDropTarget(null);
            }}
            onDragOver={(e) => {
              if (canDropHere) {
                e.preventDefault();
                e.stopPropagation();
                if (dropTarget !== node.path) setDropTarget(node.path);
              }
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (dropTarget === node.path) setDropTarget(null);
            }}
            onDrop={(e) => {
              if (canDropHere && draggedPath) {
                e.preventDefault();
                e.stopPropagation();
                handleDrop(draggedPath, node.path);
              }
            }}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              toggleFolder(node.path);
              setSelectedFolderPath(node.path);
            }}
            className={`group flex items-center justify-between py-1 px-2 rounded cursor-pointer text-xs font-medium transition-all ${
              isBeingDragged ? 'opacity-40' : ''
            } ${
              isDropOverThis
                ? 'bg-blue-500/20 border border-blue-500 text-blue-700 dark:text-blue-200 shadow-sm'
                : isSelectedFolder
                ? 'bg-slate-200 dark:bg-zinc-800/90 text-slate-900 dark:text-white border-l-2 border-blue-500'
                : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/70 dark:hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="opacity-0 group-hover:opacity-40 cursor-grab shrink-0">
                <GripVertical className="w-2.5 h-2.5 text-slate-400 dark:text-zinc-400" />
              </div>

              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
              )}
              {isCollapsed ? (
                <Folder className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
              )}

              {isRenaming ? (
                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={renamingNewName}
                    autoFocus
                    onChange={(e) => setRenamingNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolderSubmit(node.path);
                      if (e.key === 'Escape') setRenamingPath(null);
                    }}
                    onBlur={() => handleRenameFolderSubmit(node.path)}
                    className="bg-white dark:bg-zinc-900 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white outline-none w-full"
                  />
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleRenameFolderSubmit(node.path)}
                    className="p-0.5 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setRenamingPath(null)}
                    className="p-0.5 text-rose-600 dark:text-rose-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <span className="truncate">{node.name}</span>
              )}
            </div>

            {!isRenaming && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 ml-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startCreating(node.path, false);
                  }}
                  title={`New File inside ${node.name}`}
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded"
                >
                  <FilePlus className="w-3 h-3" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startCreating(node.path, true);
                  }}
                  title={`New Folder inside ${node.name}`}
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingPath(node.path);
                    setRenamingNewName(node.name);
                  }}
                  title={`Rename ${node.name}`}
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white rounded"
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile(node.path);
                  }}
                  title={`Delete ${node.name}`}
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div>
              {renderCreationInput(depth + 1, node.path)}
              {node.children && node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File Node
    const isTestFile = node.name.toLowerCase().includes('test');
    const fileParentDir = node.path.includes('/')
      ? node.path.substring(0, node.path.lastIndexOf('/'))
      : '';

    return (
      <div
        key={node.path}
        draggable={!isRenaming}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggedPath(node.path);
          e.dataTransfer.setData('text/plain', node.path);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDraggedPath(null);
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          if (draggedPath && draggedPath !== node.path) {
            e.preventDefault();
            e.stopPropagation();
            const target = fileParentDir || '__ROOT__';
            if (dropTarget !== target) setDropTarget(target);
          }
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
        }}
        onDrop={(e) => {
          if (draggedPath && draggedPath !== node.path) {
            e.preventDefault();
            e.stopPropagation();
            handleDrop(draggedPath, fileParentDir);
          }
        }}
        style={{ paddingLeft: `${depth * 12 + 16}px` }}
        className={`group flex items-center justify-between py-1 px-2 rounded cursor-pointer text-xs transition-all ${
          isBeingDragged ? 'opacity-40' : ''
        } ${
          isActive
            ? 'bg-blue-100/70 dark:bg-blue-600/20 text-blue-700 dark:text-blue-300 font-semibold border-l-2 border-blue-500'
            : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-200/70 dark:hover:bg-zinc-800/80'
        }`}
        onClick={() => {
          onSelectFile(node.path);
          setSelectedFolderPath(fileParentDir || null);
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="opacity-0 group-hover:opacity-40 cursor-grab shrink-0">
            <GripVertical className="w-2.5 h-2.5 text-slate-400 dark:text-zinc-400" />
          </div>

          <FileCode
            className={`w-3.5 h-3.5 shrink-0 ${
              isTestFile
                ? 'text-purple-600 dark:text-purple-400'
                : node.name.endsWith('.py')
                ? 'text-yellow-600 dark:text-yellow-400'
                : node.name.endsWith('.java')
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          />
          {isRenaming ? (
            <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={renamingNewName}
                autoFocus
                onChange={(e) => setRenamingNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFileSubmit(node.path);
                  if (e.key === 'Escape') setRenamingPath(null);
                }}
                onBlur={() => handleRenameFileSubmit(node.path)}
                className="bg-white dark:bg-zinc-900 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white outline-none w-full"
              />
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleRenameFileSubmit(node.path)}
                className="p-0.5 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setRenamingPath(null)}
                className="p-0.5 text-rose-600 dark:text-rose-400 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </div>

        {!isRenaming && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRenamingPath(node.path);
                setRenamingNewName(node.name);
              }}
              title="Rename file"
              className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 rounded"
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFile(node.path);
              }}
              title="Delete file"
              className="p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#f5f7fa] dark:bg-[#18181c] border-r border-slate-200/80 dark:border-white/[0.06] overflow-hidden select-none">
      <div 
        onClick={() => setSelectedFolderPath(null)}
        className="h-9 shrink-0 flex items-center justify-between px-3 border-b border-slate-200/80 dark:border-white/[0.06] bg-slate-100/70 dark:bg-[#151518] cursor-pointer"
        title={selectedFolderPath ? `Target: ${selectedFolderPath} (Click to target root)` : 'Target: Root folder'}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
            Explorer
          </span>
          {selectedFolderPath && (
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono truncate max-w-[90px] bg-blue-500/10 px-1 rounded border border-blue-500/20">
              {selectedFolderPath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => startCreating(selectedFolderPath || '', false)}
            title={selectedFolderPath ? `New File inside "${selectedFolderPath}"` : 'New File (Root)'}
            className="p-1 hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 rounded transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => startCreating(selectedFolderPath || '', true)}
            title={selectedFolderPath ? `New Folder inside "${selectedFolderPath}"` : 'New Folder (Root)'}
            className="p-1 hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 rounded transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh File Explorer"
              className="p-1 hover:bg-slate-200/70 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 rounded transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div 
        onClick={() => setSelectedFolderPath(null)}
        onDragOver={(e) => {
          if (draggedPath && draggedPath.includes('/')) {
            e.preventDefault();
            if (dropTarget !== '__ROOT__') setDropTarget('__ROOT__');
          }
        }}
        onDragLeave={() => {
          if (dropTarget === '__ROOT__') setDropTarget(null);
        }}
        onDrop={(e) => {
          if (draggedPath) {
            e.preventDefault();
            handleDrop(draggedPath, '');
          }
        }}
        className={`flex-1 overflow-y-auto py-1 px-1 transition-colors ${
          dropTarget === '__ROOT__' ? 'bg-blue-100/60 dark:bg-blue-950/20 ring-1 ring-inset ring-blue-500/40' : ''
        }`}
      >
        {renderCreationInput(0, '')}
        {tree.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
};
