<?php

class EnvLoader {
    /**
     * Loads variables from a .env file into the system environment.
     * @param string $path Full path to the .env file
     */
    public static function load(string $path): void {
        if (!file_exists($path)) {
            throw new Exception(".env file not found at: " . htmlspecialchars($path));
        }

        // Read file lines, ignoring empty rows
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        
        foreach ($lines as $line) {
            $line = trim($line);

            // Skip lines that are comments
            if (str_starts_with($line, '#')) {
                continue;
            }

            // Split into Key and Value at the first '=' sign
            if (strpos($line, '=') !== false) {
                list($key, $value) = explode('=', $line, 2);
                
                $key = trim($key);
                $value = trim($value);

                // Strip inline comments if present (e.g. key=val // comment)
                if (strpos($value, '//') !== false) {
                    list($value, ) = explode('//', $value, 2);
                    $value = trim($value);
                }

                // Strip surrounding quotes from values if they exist
                $value = trim($value, '"\'');

                // Inject securely into PHP's superglobals and environment
                $_ENV[$key] = $value;
                $_SERVER[$key] = $value;
                putenv("{$key}={$value}");
            }
        }
    }
}
