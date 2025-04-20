
import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, Camera, MapPin, UserPlus } from 'lucide-react';

const Navbar = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <span className="font-bold text-xl">RoadEye</span>
        </Link>

        <nav className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Link to="/geotagging" className="flex items-center gap-1">
                <Button variant="outline" className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  <span>Start Geotagging</span>
                </Button>
              </Link>
              <Link to="/demo">
                <Button variant="outline" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Demo Detection</span>
                </Button>
              </Link>
              <Link to="/geotag-demo">
                <Button variant="outline" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Demo Geotagging</span>
                </Button>
              </Link>
              <Button variant="ghost" onClick={handleLogout} className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </Button>
              <span className="text-sm text-muted-foreground">
                {user?.email}
              </span>
            </>
          ) : (
            <>
              <Link to="/demo">
                <Button variant="outline" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Demo Detection</span>
                </Button>
              </Link>
              <Link to="/geotag-demo">
                <Button variant="outline" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>Demo Geotagging</span>
                </Button>
              </Link>
              <Link to="/signup">
                <Button variant="outline" className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  <span>Sign Up</span>
                </Button>
              </Link>
              <Button onClick={() => navigate('/login')} className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                <span>Login</span>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
