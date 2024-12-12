import { hash } from "./mathUtils.js";

export class GameAnimator {
    constructor(settings) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true 
        });
        this.boxes = [];
        this.boxScale = 1;
        this.lastTime = undefined;

        this.boxMinX = settings?.boxMinX ?? -2;
        this.boxMaxX = settings?.boxMaxX ?? 2;
        this.boxMinY = settings?.boxMinY ?? 0;
        this.boxMaxY = settings?.boxMaxY ?? 3;
        this.hitTimeOffset = settings?.hitTimeOffset ?? 2;
        this.hitTimeWindow = settings?.hitTimeWindow ?? .2;
        this.hintTimeWindow = settings?.hintTimeWindow ?? .7;

        // Add animation state for the ground
        this.groundState = {
            time: 0,
            currentAmplitude: 0,
            currentFrequency: 0,
            targetAmplitude: 0,
            targetFrequency: 0,
            lastBeatTime: 0,
            beatDuration: 100 // ms between beats
        };

        this.initialize();
    }

    initialize() {
        // Setup renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000);
        document.getElementById('game-container').appendChild(this.renderer.domElement);

        // Setup camera
        this.camera.position.set(0, 2, 5);
        this.camera.lookAt(0, 0, 0);

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);

        // Create ground plane with more segments for smoother animation
        this.planeGeometry = new THREE.PlaneGeometry(20, 20, 32, 32);
        this.planeMaterial = new THREE.MeshStandardMaterial({
            color: 0x000000,
            roughness: 0.2,
            metalness: 0.2,
            transparent: true,
            opacity: 0.5,
            wireframe: false
        });
        
        this.groundPlane = new THREE.Mesh(this.planeGeometry, this.planeMaterial);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = -1;
        
        // Store original vertex positions
        this.originalVertices = [...this.planeGeometry.attributes.position.array];
        
        this.scene.add(this.groundPlane);

        // Add grid
        const gridHelper = new THREE.GridHelper(10, 20, 0x444444, 0x222222);
        this.scene.add(gridHelper);

        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    updateGround(beatMap) {
        // Update animation targets
        this.groundState.targetAmplitude = Math.abs(beatMap.y) * 0.5;
        this.groundState.targetFrequency = Math.abs(beatMap.x) * 2;
        
        // Update color
        const hue = (beatMap.x * 10) % 1;
        this.planeMaterial.color.setHSL(hue, 1, 0.5);
    }

    updateGroundAnimation(currentTime) {
        // Interpolate animation parameters
        this.groundState.currentAmplitude += 
            (this.groundState.targetAmplitude - this.groundState.currentAmplitude) * 0.1;
        this.groundState.currentFrequency += 
            (this.groundState.targetFrequency - this.groundState.currentFrequency) * 0.1;

        // Update vertex positions
        const vertexArray = this.planeGeometry.attributes.position.array;
        
        for (let i = 0; i < vertexArray.length; i += 3) {
            const originalZ = this.originalVertices[i + 2];
            const x = vertexArray[i];
            const y = vertexArray[i + 1];
            
            // Create smooth wave pattern
            const wave = Math.sin(x * this.groundState.currentFrequency + currentTime * 0.001) * 
                        Math.cos(y * this.groundState.currentFrequency + currentTime * 0.001);
            
            vertexArray[i + 2] = originalZ + wave * this.groundState.currentAmplitude;
        }

        this.planeGeometry.attributes.position.needsUpdate = true;
    }
    reset_seed(audio_file) {
        THREE.MathUtils.seededRandom(hash(audio_file));
    }

    createBox(beatData) {
        const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
        });

        let rand = THREE.MathUtils.seededRandom();
        material.color.setHSL(rand, 1, 0.5);

        rand = (rand * 2 - 1) * 2;
        rand = THREE.MathUtils.clamp(rand, -1.5, 1.5);

        const box = new THREE.Mesh(geometry, material);
        box.position.set(
            rand * (beatData.x * (this.boxMaxX - this.boxMinX) + this.boxMinX) * this.boxScale,
            (beatData.y * (this.boxMaxY - this.boxMinY) + this.boxMinY) * this.boxScale,
            -20
        );
        box.transparent = true;
        box.material.opacity = .5;
        box.supposedHitTime = beatData.time; // custom tags

        box.userData = {
            points: beatData.points,
            isHit: false,
            startTime: beatData.time
        };

        this.boxes.push(box);
        this.scene.add(box);
        return box;
    }


    updateBoxes(currentTime, speed = 10) {
        let boxRemoved = false;
        if (this.lastTime === undefined) {
            this.lastTime = currentTime;
            return boxRemoved;
        }

        const timeDiff = currentTime - this.lastTime;
        this.lastTime = currentTime;

        for (let i = this.boxes.length - 1; i >= 0; i--) {
            const box = this.boxes[i];

            // Move box towards camera
            box.position.z += speed * timeDiff;

            // Rotate box
            box.rotation.x += 1 * timeDiff;
            box.rotation.y += 1 * timeDiff;

            const diff = currentTime - box.supposedHitTime - this.hitTimeOffset;
            const diff2 = diff / this.hintTimeWindow;
            box.material.opacity = Math.abs(diff) < this.hitTimeWindow ? 1 : Math.max(.5, Math.min(1, 1 - diff2*diff2));
            // Remove box if it's too close or has been hit
            if (box.position.z > 5) {
                this.scene.remove(box);
                this.boxes.splice(i, 1);
                boxRemoved = true;
            } else if (box.userData.isHit) {
                this.scene.remove(box);
                this.boxes.splice(i, 1);
            }
        }
        return boxRemoved;
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        const currentTime = performance.now();
        this.updateGroundAnimation(currentTime);
        this.renderer.render(this.scene, this.camera);
    }

    clear() {
        this.boxes.forEach(box => {
            this.scene.remove(box);
        });
        this.boxes = [];
    }
}
