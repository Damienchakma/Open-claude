import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, Camera, X, RotateCcw, Check, RefreshCw, AlertCircle, FlipHorizontal } from 'lucide-react';

export function ImageUpload({ onImageSelect, onImageRemove, disabled = false, selectedImage = null }) {
    const [preview, setPreview] = useState(selectedImage || null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState(null);
    const [capturedPhoto, setCapturedPhoto] = useState(null);
    const [cameraError, setCameraError] = useState(null);
    const [facingMode, setFacingMode] = useState('user'); // 'user' (front) or 'environment' (back)
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

    const fileInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    // Sync preview with prop
    useEffect(() => {
        setPreview(selectedImage);
    }, [selectedImage]);

    // Check available cameras
    useEffect(() => {
        async function checkDevices() {
            try {
                if (navigator.mediaDevices?.enumerateDevices) {
                    const devices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = devices.filter(d => d.kind === 'videoinput');
                    setHasMultipleCameras(videoDevices.length > 1);
                }
            } catch (err) {
                console.warn('Device enumeration failed:', err);
            }
        }
        checkDevices();
    }, []);

    // Start camera stream
    const startCamera = useCallback(async (mode = facingMode) => {
        setCameraError(null);
        setCapturedPhoto(null);

        // Stop any existing stream
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }

        try {
            const constraints = {
                video: {
                    facingMode: mode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setCameraStream(stream);

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error('Camera access failed:', err);
            setCameraError(
                err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
                    ? 'Camera access was denied. Please allow camera permissions in your browser.'
                    : 'Unable to access camera. Please check your camera connection or use file upload.'
            );
        }
    }, [facingMode, cameraStream]);

    // Stop camera stream
    const stopCamera = useCallback(() => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
        setIsCameraOpen(false);
        setCapturedPhoto(null);
        setCameraError(null);
    }, [cameraStream]);

    // Open camera modal
    const openCamera = () => {
        if (disabled) return;
        setIsCameraOpen(true);
        startCamera(facingMode);
    };

    // Flip camera (front ↔ back)
    const toggleCameraFacing = () => {
        const nextMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(nextMode);
        startCamera(nextMode);
    };

    // Attach stream to video tag whenever modal opens or stream changes
    useEffect(() => {
        if (isCameraOpen && videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [isCameraOpen, cameraStream]);

    // Clean up camera stream on unmount
    useEffect(() => {
        return () => {
            if (cameraStream) {
                cameraStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [cameraStream]);

    // Capture photo from video stream
    const takePhoto = () => {
        if (!videoRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        const ctx = canvas.getContext('2d');
        if (facingMode === 'user') {
            // Mirror image horizontally for selfie cam
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedPhoto(dataUrl);
    };

    // Confirm captured photo
    const confirmPhoto = () => {
        if (capturedPhoto) {
            setPreview(capturedPhoto);
            onImageSelect(capturedPhoto);
            stopCamera();
        }
    };

    // File input handler
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            processImage(file);
        }
    };

    const processImage = (file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result;
            setPreview(base64String);
            onImageSelect(base64String);
        };
        reader.readAsDataURL(file);
    };

    const handleRemove = (e) => {
        e?.stopPropagation();
        setPreview(null);
        onImageRemove?.();
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex items-center gap-1.5">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                disabled={disabled}
                className="hidden"
                aria-label="Upload image"
            />

            {/* Upload File button */}
            <button
                onClick={() => !disabled && fileInputRef.current?.click()}
                disabled={disabled}
                className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Upload image from device"
                type="button"
            >
                <ImagePlus size={18} />
            </button>

            {/* Take Picture (Camera) button */}
            <button
                onClick={openCamera}
                disabled={disabled}
                className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Take picture with camera"
                type="button"
            >
                <Camera size={18} />
            </button>

            {/* Preview thumbnail next to button */}
            {preview && (
                <div className="relative inline-block ml-1 group">
                    <img
                        src={preview}
                        alt="Upload preview"
                        className="w-8 h-8 rounded-lg border border-[var(--border)] object-cover shadow-xs"
                    />
                    <button
                        onClick={handleRemove}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 transition-transform hover:scale-110 shadow-xs cursor-pointer"
                        aria-label="Remove image"
                        type="button"
                        title="Remove image"
                    >
                        <X size={11} />
                    </button>
                </div>
            )}

            {/* ── Camera Capture Modal ── */}
            {isCameraOpen && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col font-sans animate-scale-in">
                        {/* Camera Header */}
                        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-secondary)]">
                            <div className="flex items-center gap-2">
                                <Camera size={18} className="text-[var(--accent)]" />
                                <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                                    {capturedPhoto ? 'Review Photo' : 'Take Picture'}
                                </h3>
                            </div>
                            <button
                                onClick={stopCamera}
                                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Viewfinder / Preview Area */}
                        <div className="relative bg-black w-full aspect-4/3 flex items-center justify-center overflow-hidden">
                            {cameraError ? (
                                <div className="p-6 text-center text-white flex flex-col items-center gap-3">
                                    <AlertCircle size={32} className="text-red-400" />
                                    <p className="text-sm font-medium text-red-200">{cameraError}</p>
                                    <button
                                        onClick={() => startCamera(facingMode)}
                                        className="mt-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <RefreshCw size={14} />
                                        <span>Try Again</span>
                                    </button>
                                </div>
                            ) : capturedPhoto ? (
                                /* Captured Image Review */
                                <img
                                    src={capturedPhoto}
                                    alt="Captured snapshot"
                                    className="w-full h-full object-contain"
                                />
                            ) : (
                                /* Live Camera View */
                                <>
                                    <video
                                        ref={videoRef}
                                        autoPlay
                                        playsInline
                                        muted
                                        className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                                    />
                                    {/* Viewfinder Guide Overlay */}
                                    <div className="absolute inset-4 border border-white/20 rounded-xl pointer-events-none" />
                                </>
                            )}
                            <canvas ref={canvasRef} className="hidden" />
                        </div>

                        {/* Camera Controls Footer */}
                        <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border)] flex items-center justify-between">
                            {capturedPhoto ? (
                                /* Review controls */
                                <>
                                    <button
                                        onClick={() => setCapturedPhoto(null)}
                                        className="px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <RotateCcw size={14} />
                                        <span>Retake</span>
                                    </button>
                                    <button
                                        onClick={confirmPhoto}
                                        className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                                    >
                                        <Check size={15} />
                                        <span>Use Photo</span>
                                    </button>
                                </>
                            ) : (
                                /* Live viewfinder controls */
                                <>
                                    <div className="w-10">
                                        {hasMultipleCameras && (
                                            <button
                                                onClick={toggleCameraFacing}
                                                className="p-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-xl transition-colors cursor-pointer"
                                                title="Flip camera"
                                            >
                                                <FlipHorizontal size={18} />
                                            </button>
                                        )}
                                    </div>

                                    {/* Capture Shutter Button */}
                                    <button
                                        onClick={takePhoto}
                                        disabled={!!cameraError}
                                        className="w-14 h-14 rounded-full border-4 border-[var(--accent)] bg-white hover:bg-gray-100 flex items-center justify-center transition-transform active:scale-95 shadow-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group"
                                        title="Take photo"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-[var(--accent)] group-hover:scale-90 transition-transform" />
                                    </button>

                                    <button
                                        onClick={stopCamera}
                                        className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] px-3 py-2 rounded-xl transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

