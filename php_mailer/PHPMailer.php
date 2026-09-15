<?php
namespace PHPMailer\PHPMailer;

class Exception extends \Exception {}

class PHPMailer {
    const ENCRYPTION_STARTTLS = 'tls';
    const ENCRYPTION_SMTPS = 'ssl';

    public string $Host = '';
    public bool $SMTPAuth = true;
    public string $Username = '';
    public string $Password = '';
    public string $SMTPSecure = 'tls';
    public int $Port = 587;
    public string $Subject = '';
    public string $Body = '';
    public bool $isHTML = true;

    protected string $fromAddress = '';
    protected string $fromName = '';
    protected array $toAddresses = [];
    protected array $replyToAddresses = [];
    protected bool $useSMTP = false;

    public function __construct(bool $exceptions = true) {}

    public function isSMTP(): void {
        $this->useSMTP = true;
    }

    public function setFrom(string $address, string $name = ''): bool {
        $this->fromAddress = $address;
        $this->fromName = $name;
        return true;
    }

    public function addAddress(string $address, string $name = ''): bool {
        $this->toAddresses[] = ['address' => $address, 'name' => $name];
        return true;
    }

    public function addReplyTo(string $address, string $name = ''): bool {
        $this->replyToAddresses[] = ['address' => $address, 'name' => $name];
        return true;
    }

    public function isHTML(bool $isHtml = true): void {
        $this->isHTML = $isHtml;
    }

    public function send(): bool {
        if (empty($this->toAddresses)) {
            throw new Exception("No recipient address provided.");
        }

        if ($this->useSMTP && !empty($this->Host)) {
            return $this->sendSMTP();
        }

        return $this->sendMailFallback();
    }

    protected function sendSMTP(): bool {
        $host = $this->Host;
        $port = $this->Port;

        if ($this->SMTPSecure === self::ENCRYPTION_STARTTLS) {
            $socketHost = $host;
        } elseif ($this->SMTPSecure === self::ENCRYPTION_SMTPS) {
            $socketHost = "ssl://{$host}";
        } else {
            $socketHost = $host;
        }

        $context = stream_context_create([
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ]);

        $socket = @stream_socket_client("{$socketHost}:{$port}", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
        if (!$socket) {
            // Fallback to mail() if direct socket failed
            return $this->sendMailFallback();
        }

        $this->readResponse($socket);

        // EHLO Command
        $this->sendCommand($socket, "EHLO " . gethostname());

        // STARTTLS if configured
        if ($this->SMTPSecure === self::ENCRYPTION_STARTTLS) {
            $this->sendCommand($socket, "STARTTLS");
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($socket);
                return $this->sendMailFallback();
            }
            $this->sendCommand($socket, "EHLO " . gethostname());
        }

        // AUTH LOGIN
        if ($this->SMTPAuth && !empty($this->Username)) {
            $this->sendCommand($socket, "AUTH LOGIN");
            $this->sendCommand($socket, base64_encode($this->Username));
            $this->sendCommand($socket, base64_encode($this->Password));
        }

        // MAIL FROM
        $this->sendCommand($socket, "MAIL FROM: <{$this->fromAddress}>");

        // RCPT TO
        foreach ($this->toAddresses as $to) {
            $this->sendCommand($socket, "RCPT TO: <{$to['address']}>");
        }

        // DATA
        $this->sendCommand($socket, "DATA");

        $headers = [];
        $headers[] = "From: " . ($this->fromName ? "{$this->fromName} <{$this->fromAddress}>" : $this->fromAddress);
        
        $toHeader = [];
        foreach ($this->toAddresses as $to) {
            $toHeader[] = $to['name'] ? "{$to['name']} <{$to['address']}>" : $to['address'];
        }
        $headers[] = "To: " . implode(', ', $toHeader);

        if (!empty($this->replyToAddresses)) {
            $replyHeader = [];
            foreach ($this->replyToAddresses as $r) {
                $replyHeader[] = $r['name'] ? "{$r['name']} <{$r['address']}>" : $r['address'];
            }
            $headers[] = "Reply-To: " . implode(', ', $replyHeader);
        }

        $headers[] = "Subject: {$this->Subject}";
        $headers[] = "MIME-Version: 1.0";
        $headers[] = $this->isHTML ? "Content-Type: text/html; charset=UTF-8" : "Content-Type: text/plain; charset=UTF-8";

        $message = implode("\r\n", $headers) . "\r\n\r\n" . $this->Body . "\r\n.";
        $this->sendCommand($socket, $message);

        // QUIT
        $this->sendCommand($socket, "QUIT");
        fclose($socket);

        return true;
    }

    protected function sendCommand($socket, string $command): string {
        fputs($socket, $command . "\r\n");
        return $this->readResponse($socket);
    }

    protected function readResponse($socket): string {
        $response = "";
        while ($str = fgets($socket, 515)) {
            $response .= $str;
            if (substr($str, 3, 1) == " ") {
                break;
            }
        }
        return $response;
    }

    protected function sendMailFallback(): bool {
        $toStr = implode(', ', array_map(fn($t) => $t['address'], $this->toAddresses));
        $headers = [];
        $headers[] = "From: " . ($this->fromName ? "{$this->fromName} <{$this->fromAddress}>" : $this->fromAddress);
        if (!empty($this->replyToAddresses)) {
            $headers[] = "Reply-To: " . $this->replyToAddresses[0]['address'];
        }
        $headers[] = "MIME-Version: 1.0";
        $headers[] = $this->isHTML ? "Content-Type: text/html; charset=UTF-8" : "Content-Type: text/plain; charset=UTF-8";

        return @mail($toStr, $this->Subject, $this->Body, implode("\r\n", $headers));
    }
}
