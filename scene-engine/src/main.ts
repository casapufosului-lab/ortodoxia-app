import * as THREE from 'three';

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0f05); // Dark warm brown

// Camera
const camera = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.1, 1000);
camera.position.z = 5;

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(1080, 1920);
document.body.appendChild(renderer.domElement);

// Light
const ambientLight = new THREE.AmbientLight(0xffcc99, 0.5); // Warm
scene.add(ambientLight);
const pointLight = new THREE.PointLight(0xffaa55, 1);
pointLight.position.set(2, 2, 2);
scene.add(pointLight);

// Fog
scene.fog = new THREE.Fog(0x1a0f05, 1, 10);

// Particles
const geometry = new THREE.BufferGeometry();
const vertices = [];
for (let i = 0; i < 500; i++) {
    vertices.push(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
}
geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
const material = new THREE.PointsMaterial({ color: 0xffd700, size: 0.05 });
const particles = new THREE.Points(geometry, material);
scene.add(particles);

// Animation
function animate() {
    requestAnimationFrame(animate);
    camera.position.z -= 0.005; // Slow movement forward
    renderer.render(scene, camera);
}
animate();
