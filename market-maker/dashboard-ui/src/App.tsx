import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { apiClient } from './api/client';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Try to load saved credentials
        const hasCredentials = apiClient.loadCredentials();
        if (hasCredentials) {
            // Verify credentials are still valid
            apiClient.getHealth()
                .then(() => setIsAuthenticated(true))
                .catch(() => {
                    apiClient.clearCredentials();
                    setIsAuthenticated(false);
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={() => setIsAuthenticated(true)} />;
    }

    return (
        <QueryClientProvider client={queryClient}>
            <Dashboard onLogout={() => setIsAuthenticated(false)} />
        </QueryClientProvider>
    );
}

export default App;
