import { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { api, isElectron } from '../lib/api';

export function TrafficLights() {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    setFocused(document.hasFocus());
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return (
    <div className={`traffic-lights${focused ? ' window-focused' : ''}`} aria-label="窗口控制">
      <button
        type="button"
        className="traffic-light traffic-light-close"
        aria-label="关闭窗口"
        title={isElectron ? '关闭' : '关闭（桌面应用中可用）'}
        onClick={() => api.close()}
      >
        <X size={8} strokeWidth={3} />
      </button>
      <button
        type="button"
        className="traffic-light traffic-light-minimize"
        aria-label="最小化窗口"
        title={isElectron ? '最小化' : '最小化（桌面应用中可用）'}
        onClick={() => api.minimize()}
      >
        <Minus size={8} strokeWidth={3} />
      </button>
      <button
        type="button"
        className="traffic-light traffic-light-zoom"
        aria-label="最大化窗口"
        title={isElectron ? '缩放' : '缩放（桌面应用中可用）'}
        onClick={() => api.toggleMaximize()}
      >
        <Plus size={8} strokeWidth={3} />
      </button>
    </div>
  );
}
