
export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: string;
  message: string;
  data?: any;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  log(category: string, message: string, data?: any) {
    this.add('INFO', category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    this.add('WARN', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    this.add('ERROR', category, message, data);
  }

  private add(level: 'INFO' | 'WARN' | 'ERROR', category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.shift();
    
    // Mirror to console
    const style = level === 'ERROR' ? 'color: red; font-weight: bold;' : 
                  level === 'WARN' ? 'color: orange; font-weight: bold;' : 'color: cyan;';
    
    if (category === 'BOOLEAN') {
         console.log(`%c[BOOL] ${message}`, 'color: magenta; font-weight: bold;', data || '');
    } else {
         console.log(`%c[${category}] ${message}`, style, data || '');
    }
  }

  downloadLogs() {
    const blob = new Blob([JSON.stringify(this.logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `thoughtless-debug-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const logger = new DebugLogger();
