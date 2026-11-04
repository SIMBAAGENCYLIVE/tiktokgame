FROM maven:3.9-eclipse-temurin-17
WORKDIR /app
COPY pom.xml .
COPY src ./src
COPY public ./public
RUN mvn -q -B compile dependency:copy-dependencies -DoutputDirectory=target/dependency
CMD ["sh", "-c", "java -cp target/classes:target/dependency/* arene.Bridge"]
