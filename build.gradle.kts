import org.jetbrains.kotlin.gradle.tasks.KotlinCompile
import org.springframework.boot.gradle.tasks.bundling.BootBuildImage

plugins {
    java
    id("org.springframework.boot") version "3.0.2-SNAPSHOT"
    id("io.spring.dependency-management") version "1.1.0"
    id("org.graalvm.buildtools.native") version "0.9.19"
    id("org.jlleitschuh.gradle.ktlint") version "11.0.0"
    id("jacoco")
    id("org.sonarqube") version "3.5.0.2730"
    kotlin("jvm") version "1.7.22"
    kotlin("plugin.spring") version "1.7.22"
}

group = "com.abrahammenendez"
version = "0.0.1-SNAPSHOT"
java.sourceCompatibility = JavaVersion.VERSION_17

repositories {
    mavenCentral()
    maven { url = uri("https://repo.spring.io/milestone") }
    maven { url = uri("https://repo.spring.io/snapshot") }
}

dependencyManagement {
    imports {
        mavenBom("org.testcontainers:testcontainers-bom:1.17.6")
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-data-mongodb-reactive")
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("io.projectreactor.kotlin:reactor-kotlin-extensions")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlin:kotlin-stdlib-jdk8")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor")
    developmentOnly("org.springframework.boot:spring-boot-devtools")
    annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("io.projectreactor:reactor-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:mongodb")
}

configurations {
    compileOnly {
        extendsFrom(configurations.annotationProcessor.get())
    }
}

configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
    reporters {
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.JSON)
    }
}

tasks.withType<KotlinCompile> {
    kotlinOptions {
        freeCompilerArgs = listOf("-Xjsr305=strict")
        jvmTarget = "17"
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
    finalizedBy(tasks.jacocoTestCoverageVerification)
}

jacoco {
    toolVersion = "0.8.8"
    reportsDirectory.set(layout.buildDirectory.dir("jacocoReportDir"))
}

tasks.withType<JacocoCoverageVerification> {
    violationRules {
        rule {
            limit {
                minimum = "0.0".toBigDecimal()
            }
        }
    }
    // Exclude migration folder from code coverage since those are always untested
    afterEvaluate {
        classDirectories.setFrom(
            files(
                classDirectories.files.map {
                    fileTree(it).apply {
                        exclude("**/migration/*")
                    }
                },
            ),
        )
    }
    dependsOn(tasks.test)
    finalizedBy(tasks.jacocoTestReport)
}

tasks.withType<JacocoReport> {
    // Exclude migration folder from code coverage since those are always untested
    afterEvaluate {
        classDirectories.setFrom(
            files(
                classDirectories.files.map {
                    fileTree(it).apply {
                        exclude("**/migration/*")
                    }
                },
            ),
        )
    }
    reports {
        xml.required.set(true)
        csv.required.set(false)
        html.required.set(false)
    }
}

tasks.sonarqube {
    shouldRunAfter(tasks.test)
}

sonarqube {
    properties {
        property("sonar.projectKey", "abrahammenendez_personal-website")
        property("sonar.organization", "abrahammenendez")
        property("sonar.host.url", "https://sonarcloud.io")

        // ktlint paths
        property(
            "sonar.kotlin.ktlint.reportPaths",
            "build/reports/ktlint/ktlintKotlinScriptCheck/ktlintKotlinScriptCheck.json," +
                "build/reports/ktlint/ktlintMainSourceSetCheck/ktlintMainSourceSetCheck.json," +
                "build/reports/ktlint/ktlintTestSourceSetCheck/ktlintTestSourceSetCheck.json",
        )
        // jacoco paths
        property("sonar.coverage.jacoco.xmlReportPaths", "build/jacocoReportDir/test/*")

        // specific rule exclusions as defined below
        property("sonar.issue.ignore.multicriteria", "migrationNaming,testNaming")

        // migrations do not follow the normal naming schema for classes
        property("sonar.issue.ignore.multicriteria.migrationNaming.ruleKey", "kotlin:S101")
        property("sonar.issue.ignore.multicriteria.migrationNaming.resourceKey", "**/migration/*")

        // test do not follow the normal naming schema for functions
        property("sonar.issue.ignore.multicriteria.testNaming.ruleKey", "kotlin:S100")
        property("sonar.issue.ignore.multicriteria.testNaming.resourceKey", "src/test/**/*")

        val codeCoverageExclusions = listOf(
            "**/migration/*",
        )
        // exclude code coverage analysis for the above-mentioned list
        property("sonar.coverage.exclusions", codeCoverageExclusions)
    }
}

val imageRegistryName: String by project
val imageRegistryUsername: String by project
val imageCompleteName: String = "$imageRegistryName/$imageRegistryUsername/${rootProject.name}"
tasks.withType<BootBuildImage> {
    imageName.set(imageCompleteName)
    builder.set("paketobuildpacks/builder:tiny")
    environment.set(
        environment.get() + mapOf(
            "BP_OCI_SOURCE" to "https://github.com/$imageRegistryUsername/${rootProject.name}",
            "BP_NATIVE_IMAGE" to "true",
        ),
    )
    System.getenv()["IMAGE_ADDITIONAL_TAGS"]?.also { tagsList ->
        tags.set(tagsList.split(",").map { "$imageCompleteName:$it" }.toList())
    }
    System.getenv()["IMAGE_REGISTRY_TOKEN"]?.also {
        publish.set(true)
        docker {
            publishRegistry {
                url.set(imageRegistryName)
                username.set(imageRegistryUsername)
                password.set(it)
            }
        }
    }
    buildCache {
        volume {
            name.set("cache-${rootProject.name}.build")
        }
    }
    launchCache {
        volume {
            name.set("cache-${rootProject.name}.launch")
        }
    }
}
