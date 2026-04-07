# Kinetic Scholar Backend Services

This repository contains the backend microservices for the Kinetic Scholar English learning platform. The backend is built using Java and Spring Boot, following a microservices architecture.

## Architecture

The backend consists of the following microservices:

1. **config-server**: Configuration server for all microservices
2. **api-gateway**: API gateway for routing requests to the appropriate services
3. **user-service**: User management service
4. **learning-content-service**: Learning content management service
5. **test-service**: Test management service

## Prerequisites

- Java 17 or higher
- Maven 3.8 or higher
- PostgreSQL 14 or higher
- Redis 7.0 or higher

## Setup

### 1. Database Setup

1. Install PostgreSQL and create a database named `kineticscholar`
2. Create a user with username `postgres` and password `postgres`
3. Install Redis and ensure it's running on port 6379

### 2. Build the Project

```bash
cd backend
mvn clean install
```

### 3. Run the Services

Start the services in the following order:

1. **Config Server**
   ```bash
   cd config-server
   mvn spring-boot:run
   ```

2. **API Gateway**
   ```bash
   cd api-gateway
   mvn spring-boot:run
   ```

3. **User Service**
   ```bash
   cd user-service
   mvn spring-boot:run
   ```

4. **Learning Content Service**
   ```bash
   cd learning-content-service
   mvn spring-boot:run
   ```

5. **Test Service**
   ```bash
   cd test-service
   mvn spring-boot:run
   ```

## Service Endpoints

### Config Server
- URL: http://localhost:8888
- Eureka Dashboard: http://localhost:8888/eureka/

### API Gateway
- URL: http://localhost:8080

### User Service
- Base URL: http://localhost:8081
- Endpoints:
  - POST /api/register - Register a new user
  - POST /api/login - Login and get JWT token
  - GET /api/users - Get all users
  - GET /api/users/{id} - Get user by ID
  - GET /api/users/role/{role} - Get users by role
  - PUT /api/users/{id} - Update user
  - DELETE /api/users/{id} - Delete user

### Learning Content Service
- Base URL: http://localhost:8082
- Endpoints:
  - GET /api/units - Get all units
  - GET /api/units/{id} - Get unit by ID
  - POST /api/units - Create a new unit
  - PUT /api/units/{id} - Update unit
  - DELETE /api/units/{id} - Delete unit
  - GET /api/units/{unitId}/words - Get words by unit ID
  - GET /api/units/{unitId}/words/group/{groupId} - Get words by unit ID and group ID
  - POST /api/words - Create a new word
  - PUT /api/words/{id} - Update word
  - DELETE /api/words/{id} - Delete word
  - GET /api/units/{unitId}/phrases - Get phrases by unit ID
  - GET /api/units/{unitId}/phrases/group/{groupId} - Get phrases by unit ID and group ID
  - POST /api/phrases - Create a new phrase
  - PUT /api/phrases/{id} - Update phrase
  - DELETE /api/phrases/{id} - Delete phrase
  - GET /api/units/{unitId}/reading - Get reading by unit ID
  - POST /api/readings - Create a new reading
  - PUT /api/readings/{id} - Update reading
  - DELETE /api/readings/{id} - Delete reading
  - GET /api/units/{unitId}/quizzes - Get quizzes by unit ID
  - POST /api/quizzes - Create a new quiz
  - PUT /api/quizzes/{id} - Update quiz
  - DELETE /api/quizzes/{id} - Delete quiz

### Test Service
- Base URL: http://localhost:8083
- Endpoints:
  - POST /api/word-tests - Create a new word test
  - GET /api/word-tests - Get all word tests
  - GET /api/word-tests/creator/{creatorId} - Get word tests by creator
  - GET /api/word-tests/unit/{unitId} - Get word tests by unit ID
  - GET /api/word-tests/{id} - Get word test by ID
  - PUT /api/word-tests/{id} - Update word test
  - DELETE /api/word-tests/{id} - Delete word test
  - POST /api/word-tests/{testId}/assign - Assign test to students
  - GET /api/test-assignments/user/{userId}/pending - Get pending test assignments for user
  - POST /api/test-assignments/{assignmentId}/submit - Submit test

## Deployment

### Local Development

For local development, you can run the services using the `mvn spring-boot:run` command as described above.

### Production Deployment

For production deployment, you can build the services as Docker containers and deploy them to a Kubernetes cluster or any other container orchestration platform.

1. Build Docker images for each service
2. Push the images to a container registry
3. Deploy the services using Kubernetes manifests or Helm charts

## Monitoring

You can monitor the services using Spring Boot Actuator endpoints:

- Health check: http://localhost:{port}/actuator/health
- Info: http://localhost:{port}/actuator/info

## Logging

Each service logs to the console by default. For production, you should configure a centralized logging system like ELK Stack.

## Security

- JWT is used for authentication
- Passwords are encrypted using BCrypt
- HTTPS should be enabled in production

## Contributing

Please feel free to contribute to this project by submitting pull requests or opening issues.
